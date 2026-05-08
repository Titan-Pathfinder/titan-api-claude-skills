# Routing, Fees, Errors, and Browser Deployment

> Read this when the user is configuring routing constraints (DEX inclusion/exclusion, direct-only routes), collecting platform fees, debugging error responses, implementing reconnection logic, or deploying Titan in a browser frontend (which requires a backend proxy to keep API keys off the client).

## Discovering Available DEXes

```typescript
// SDK (Titan Direct)
const venues = await client.getVenues();
// { labels: ["Raydium", "Whirlpool", "Phoenix", ...], programIds?: [...] }

const providers = await client.listProviders();
// [{ name: "...", kind: "DexAggregator" | "RFQ", id: "..." }, ...]
```

```typescript
// Titan Gateway (REST)
const venuesRes = await fetch(`${process.env.TITAN_ENDPOINT}/api/v1/venues`, {
  headers: {
    'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
    'Accept': 'application/vnd.msgpack',
  },
});
const venues = decoder.decode(new Uint8Array(await venuesRes.arrayBuffer())) as any;
// { labels: ["Raydium", "Whirlpool", "Phoenix", ...] }
```

```typescript
// Raw WebSocket (Titan Direct)
const request = {
  id: ++requestId,
  data: { GetVenues: {} },
};
ws.send(encode(request));
// Response.data.GetVenues contains { labels: [...] }
```

---

## Configuring Routing

Filter venues and providers for both Titan Direct and Titan Gateway:

**Available venue filters:** Raydium, Phoenix, Meteora, Orca, Whirlpool, PumpFun (use `GetVenues`/`GET /api/v1/venues` for the full list)

**Titan Direct:**
```typescript
await client.newSwapQuoteStream({
  swap: {
    inputMint, outputMint, amount,
    dexes: ["Raydium", "Phoenix"],       // Only these venues
    excludeDexes: ["PumpFun"],           // Exclude these
    onlyDirectRoutes: true,              // Skip multi-hop
  },
  transaction: { userPublicKey },
});
```

**Titan Gateway:**
```typescript
const params = new URLSearchParams({
  inputMint: '...', outputMint: '...', amount: '...', userPublicKey: '...',
  dexes: 'Raydium,Phoenix',
  excludeDexes: 'PumpFun',
  onlyDirectRoutes: 'true',
});
```

---

## Fee Collection

Collect platform fees on swaps. The fee is deducted from the swap amount, not added on top.

- Fee taken from **output token by default** (or input with `feeFromInputMint`)
- Fee account must be an existing ATA for the correct mint
- Every SwapRoute includes `platformFee` with `amount` and `feeBps` for display

**Titan Direct:**
```typescript
await client.newSwapQuoteStream({
  swap: { inputMint, outputMint, amount, slippageBps: 50 },
  transaction: {
    userPublicKey,
    feeAccount: bs58.decode("YOUR_FEE_TOKEN_ACCOUNT"),
    feeBps: 100,  // 1% fee
  },
});
```

**Titan Gateway:**
```typescript
const params = new URLSearchParams({
  inputMint: '...', outputMint: '...', amount: '...', userPublicKey: '...',
  feeAccount: 'YOUR_FEE_TOKEN_ACCOUNT',
  feeBps: '100',
});
```

---

Query server settings before streaming:

```typescript
// Titan Direct (SDK)
const info = await client.getInfo();
console.log(info.settings);
// {
//   quoteUpdate: { intervalMs: { min, max, default }, num_quotes: { min, max, default } },
//   swap: { slippageBps: { min, max, default }, onlyDirectRoutes: boolean },
//   transaction: { closeInputTokenAccount: boolean, createOutputTokenAccount: boolean },
//   connection: { concurrentStreams: number }
// }
```

---

## Error Handling

### SDK Error Types (Titan Direct)

```typescript
import { client } from "@titanexchange/sdk-ts";

try {
  // ... streaming code
} catch (err) {
  if (err instanceof client.ConnectionClosed) {
    // WebSocket closed unexpectedly
    console.log(`Closed: ${err.code} - ${err.reason} (clean: ${err.wasClean})`);
  } else if (err instanceof client.ConnectionError) {
    // Failed to establish connection
    console.log("Connection failed:", err.cause);
  } else if (err instanceof client.ErrorResponse) {
    // Server rejected request
    console.log(`Error ${err.response.code}: ${err.response.message}`);
  } else if (err instanceof client.StreamError) {
    // Stream terminated with error
    console.log(`Stream ${err.streamId} error: [${err.errorCode}] ${err.errorMessage}`);
  } else if (err instanceof client.ProtocolError) {
    // Protocol-level error (usually a bug)
    console.log(`Protocol error: ${err.reason}`, err.data);
  }
}
```

### Titan Gateway Error Handling

```typescript
const res = await fetch(`${TITAN_ENDPOINT}/api/v1/quote/swap?${params}`, {
  headers: {
    'Authorization': `Bearer ${TITAN_API_KEY}`,
    'Accept': 'application/vnd.msgpack',
  },
});

if (!res.ok) {
  switch (res.status) {
    case 400: console.error('Invalid parameters'); break;
    case 401: console.error('Invalid or expired token'); break;
    case 404: console.error('No routes found — try relaxing filters'); break;
    default:  console.error(`Unexpected: ${res.status}`);
  }
}
```

### Reconnection Pattern (Titan Direct)

```typescript
async function connectWithRetry(maxRetries = 5): Promise<V1Client> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const client = await V1Client.connect(`${TITAN_ENDPOINT}?auth=${TITAN_API_KEY}`);

      client.listen_closed().then(() => {
        console.log("Connection lost, reconnecting...");
        connectWithRetry();
      });

      return client;
    } catch (err) {
      attempt++;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw new Error("Max retries exceeded");
}
```

---

## Browser Security

**CRITICAL:** Never expose API keys in browser code. Anyone can inspect browser network traffic.

**Required approach:** Backend proxy (for Titan Direct) or server-side API calls (for Titan Gateway)

```
Browser -> Your Backend (validates auth) -> Titan API
```

### Backend Proxy Example (Titan Direct)

```typescript
import "dotenv/config";
import { WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080, path: "/ws" });

wss.on("connection", async (clientWs, req) => {
  // 1. Validate YOUR user auth
  const url = new URL(req.url!, "http://localhost");
  const userToken = url.searchParams.get("token");

  if (!validateUserToken(userToken)) {
    clientWs.close(4001, "Unauthorized");
    return;
  }

  // 2. Connect to Titan with YOUR API key (server-side only)
  const titanWs = new WebSocket(
    `${process.env.TITAN_ENDPOINT}?auth=${process.env.TITAN_API_KEY}`,
    ["v1.api.titan.ag"]
  );

  // 3. Forward messages bidirectionally
  clientWs.on("message", (data) => {
    if (titanWs.readyState === WebSocket.OPEN) {
      titanWs.send(data);
    }
  });

  titanWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  // 4. Clean up
  clientWs.on("close", () => titanWs.close());
  titanWs.on("close", () => clientWs.close());
});
```

### Backend Proxy Example (Titan Gateway)

```typescript
import express from "express";

const app = express();

app.get("/api/quote/swap", async (req, res) => {
  // 1. Validate YOUR user auth
  if (!validateUserToken(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Forward to Titan Gateway with YOUR API key
  const titanRes = await fetch(
    `${process.env.TITAN_ENDPOINT}/api/v1/quote/swap?${new URLSearchParams(req.query as any)}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
        'Accept': 'application/vnd.msgpack',
      },
    }
  );

  // 3. Forward response to client
  res.status(titanRes.status);
  res.set('Content-Type', 'application/vnd.msgpack');
  const buffer = await titanRes.arrayBuffer();
  res.send(Buffer.from(buffer));
});
```

### Frontend Usage

```typescript
// Titan Direct — connect to YOUR proxy
import { V1Client } from "@titanexchange/sdk-ts/browser";
const client = await V1Client.connect("wss://your-api.com/ws?token=user_session");

// Titan Gateway — call YOUR proxy
const res = await fetch(`/api/quote/swap?${params}`);
```
