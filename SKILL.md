---
name: titan-swap-api
description: Titan Swap API integration guide. Use when developers ask about streaming swap quotes, integrating with Titan DEX aggregator, or building Solana swap functionality.
---

# Titan Swap API Knowledge Base

Titan is a WebSocket-based DEX aggregator for Solana that streams live swap quotes from multiple liquidity providers.

## How Titan Works

**Connection:** WebSocket protocol at `wss://[endpoint]/api/v1/ws?auth=[token]`

**Protocol:** MessagePack binary encoding (NOT JSON or protobuf)

**Sub-protocols:** `v1.api.titan.ag`, `v1.api.titan.ag+zstd`, `v1.api.titan.ag+brotli`, `v1.api.titan.ag+gzip`

**Primary mode:** `newSwapQuoteStream()` - Continuous quote streaming with pre-built transactions

**Token amounts:** Always raw amounts (atoms) as **BigInt**:
- 1 USDC = `BigInt(1_000_000)` (6 decimals)
- 1 SOL = `BigInt(1_000_000_000)` (9 decimals)
- 1 BONK = `BigInt(100_000)` (5 decimals)

**CRITICAL:** Amount must be passed as `BigInt`, not `number`.

**Tip:** Consider validating amounts before encoding. Token amounts are unsigned 64-bit integers, so a simple helper can catch fractional values, negative numbers, or out-of-range inputs early with clear error messages instead of letting MessagePack encoding fail:

```typescript
const UINT64_MAX = BigInt("18446744073709551615"); // 2^64 - 1

function validateAmount(input: number | bigint): bigint {
  if (typeof input === "number" && !Number.isInteger(input)) {
    throw new Error(`Amount must be a whole number (got ${input}). Token amounts are in raw atoms.`);
  }
  const amount = BigInt(input);
  if (amount < 0n || amount > UINT64_MAX) {
    throw new Error(`Amount out of uint64 range [0, ${UINT64_MAX}] (got ${amount}).`);
  }
  return amount;
}
```

## Common Token Mints

```typescript
const TOKENS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL:  "So11111111111111111111111111111111111111112",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
};
```

## Required Credentials

Users need:
- `WS_URL` - WebSocket endpoint
- `AUTH_TOKEN` - API authentication token
- `USER_PUBLIC_KEY` - Wallet address (base58, required for transaction generation)

Ask users if they have these ready before showing implementation code.

---

# Integration Options

Titan API can be integrated two ways:
1. **Using the SDK** (recommended) - TypeScript/Rust SDKs with built-in protocol handling
2. **Raw WebSocket** - Direct WebSocket connection with MessagePack encoding

---

# Option 1: SDK Integration

## Installation

```bash
npm install @titanexchange/sdk-ts bs58 dotenv
```

Requires Node.js >=18.19. For browser: `import { V1Client } from "@titanexchange/sdk-ts/browser"`

## Environment Setup

Create a `.env` file:
```env
WS_URL=wss://api.titan.ag/api/v1/ws
AUTH_TOKEN=your_token_here
USER_PUBLIC_KEY=YourWalletPublicKeyBase58
```

Load in code:
```typescript
import "dotenv/config";
```

## Connection Pattern

```typescript
import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";

const client = await V1Client.connect(`${process.env.WS_URL}?auth=${process.env.AUTH_TOKEN}`);

// Monitor connection state
client.listen_closed().then(() => {
  console.log("Connection closed, implement reconnection");
});

// Always close when done
await client.close();
```

## Streaming Quotes (Primary Use Case)

### Basic Streaming Setup

```typescript
import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

const client = await V1Client.connect(`${process.env.WS_URL}?auth=${process.env.AUTH_TOKEN}`);

// Token mints MUST be Uint8Array (use bs58.decode for base58 addresses)
const inputMint = bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");  // USDC
const outputMint = bs58.decode("So11111111111111111111111111111111111111112"); // SOL
const userPublicKey = bs58.decode(process.env.USER_PUBLIC_KEY!);

// Start streaming quotes
const { stream, streamId, response } = await client.newSwapQuoteStream({
  swap: {
    inputMint,
    outputMint,
    amount: BigInt(10_000_000), 
    slippageBps: 50,             // 0.5% slippage - MUST be inside swap object
  },
  transaction: {
    userPublicKey,
  },
  update: {
    intervalMs: 1000,    
    num_quotes: 3,       // Number of quotes per update
  },
});

console.log(`Stream started, interval: ${response.intervalMs}ms`);

// Process incoming quotes
for await (const quotes of stream) {
  if (Object.keys(quotes.quotes).length === 0) {
    console.log("No routes available");
    continue;
  }

  for (const [providerId, route] of Object.entries(quotes.quotes)) {
    console.log(`Provider ${providerId}: ${route.outAmount} output`);

    if (route.transaction) {
      console.log(`Transaction ready: ${route.transaction.length} bytes`);
    }
  }
}

// Stop stream when done
await client.stopStream(streamId);
await client.close();
```

### CRITICAL: Parameter Structure

**WRONG** (will cause TypeScript errors):
```typescript
// DON'T DO THIS
await client.newSwapQuoteStream({
  swap: { inputMint, outputMint, amount },
  transaction: { userPublicKey },
  slippageBps: 50,    // WRONG - not at top level
  intervalMs: 1000,   // WRONG - not at top level
});
```

**CORRECT**:
```typescript
await client.newSwapQuoteStream({
  swap: {
    inputMint,
    outputMint,
    amount,
    slippageBps: 50,      // CORRECT 
  },
  transaction: {
    userPublicKey,
  },
  update: {
    intervalMs: 1000,     // CORRECT 
    num_quotes: 3,
  },
});
```

### Full Parameter Reference

```typescript
interface SwapQuoteRequest {
  swap: {
    inputMint: Uint8Array;       // Required: 32-byte token mint
    outputMint: Uint8Array;      // Required: 32-byte token mint
    amount: number | bigint;     // Required: Raw amount in atoms

    // Optional parameters
    slippageBps?: number;        // Slippage tolerance (50 = 0.5%)
    swapMode?: "ExactIn" | "ExactOut";
    dexes?: string[];            // Only use these DEXes
    excludeDexes?: string[];     // Exclude specific DEXes
    onlyDirectRoutes?: boolean;  // Skip multi-hop routes
  };

  transaction: {
    userPublicKey: Uint8Array;   // Required: Your wallet address

    // Optional parameters
    feeAccount?: Uint8Array;     // Platform fee recipient
    feeBps?: number;             // Platform fee (10 = 0.1%)
  };

  update?: {
    intervalMs?: number;         // Update frequency (default: server decides)
    num_quotes: number;          // Quotes per update
  };
}
```

### Stream Response Structure

```typescript
// What newSwapQuoteStream() returns
interface StreamResult {
  stream: ReadableStream<SwapQuotes>;  // Async iterable of quotes
  streamId: number;                     // Use to stop stream
  response: {
    intervalMs: number;                 // Actual interval being used
  };
}

// Each quote update
interface SwapQuotes {
  id: string;           // Quote ID like "swap:123456789:0"
  inputMint: Uint8Array;
  outputMint: Uint8Array;
  swapMode: "ExactIn" | "ExactOut";
  amount: number;
  quotes: { [providerId: string]: SwapRoute };  // Can be empty!
}

// Individual route from a provider
interface SwapRoute {
  inAmount: number;
  outAmount: number;
  slippageBps: number;
  transaction?: Uint8Array;    // Pre-built transaction bytes
  expiresAtMs?: number;        // Timestamp when quote expires
  expiresAfterSlot?: number;   // Slot when quote expires
  computeUnits?: number;
  computeUnitsSafe?: number;
  steps: RoutePlanStep[];      // Route path details
}
```

### Getting Transaction Data from Quotes

The API returns pre-built transaction bytes that you can deserialize into a `VersionedTransaction`:

```typescript
import { VersionedTransaction } from "@solana/web3.js";

for await (const quotes of stream) {
  const routes = Object.values(quotes.quotes);
  if (routes.length === 0) continue;

  const bestRoute = routes[0];

  // Check expiration
  if (bestRoute.expiresAtMs && Date.now() > bestRoute.expiresAtMs) {
    console.log("Quote expired, waiting for next");
    continue;
  }

  if (!bestRoute.transaction) continue;

  // Deserialize to VersionedTransaction
  const tx = VersionedTransaction.deserialize(bestRoute.transaction);

  // tx is ready for signing and sending
  // User handles signing with their own wallet/keypair
  console.log("Transaction ready:", tx);

  await client.stopStream(streamId);
  break;
}
```

The `route.transaction` field contains the serialized transaction bytes. Users are responsible for:
1. Deserializing with `VersionedTransaction.deserialize()`
2. Signing with their wallet
3. Sending to the network

---

# Option 2: Raw WebSocket Integration (No SDK)

For languages without SDK support or when you need full control, connect directly via WebSocket.

## Protocol Overview

- **Transport:** WebSocket with binary messages
- **Encoding:** MessagePack (use `@msgpack/msgpack` in Node.js)
- **Sub-protocol:** Must specify `v1.api.titan.ag` (or with compression suffix)

## Installation

```bash
npm install ws @msgpack/msgpack bs58 dotenv
```

## Message Format

All messages are MessagePack-encoded objects.

### Client Request Structure

```typescript
interface ClientRequest {
  id: number;              // Unique request ID (increment for each request)
  data: RequestData;       // Request payload
}

type RequestData =
  | { NewSwapQuoteStream: SwapQuoteRequest }
  | { StopStream: { id: number } }
  | { GetInfo: {} }
  | { GetVenues: {} }
  | { ListProviders: {} };
```

### Server Response Types

```typescript
// Server sends ONE of these message types per message
type ServerMessage =
  | { Response: ResponseSuccess }   // Response to a request
  | { Error: ResponseError }        // Error response
  | { StreamData: StreamData }      // Streaming quote data
  | { StreamEnd: StreamEnd };       // Stream terminated

interface ResponseSuccess {
  requestId: number;
  data: ResponseData;
  stream?: {
    id: number;           // Stream ID to use for StopStream
    dataType: "SwapQuotes";
  };
}

interface StreamData {
  id: number;             // Stream ID
  seq: number;            // Sequence number (starts at 0)
  payload: {
    SwapQuotes: SwapQuotes;
  };
}

interface ResponseError {
  requestId: number;
  code: number;
  message: string;
}

interface StreamEnd {
  id: number;
  errorCode?: number;
  errorMessage?: string;
}
```

## Complete Raw WebSocket Example

```typescript
import "dotenv/config";
import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";
import bs58 from "bs58";

const WS_URL = process.env.WS_URL!;
const AUTH_TOKEN = process.env.AUTH_TOKEN!;
const USER_PUBLIC_KEY = process.env.USER_PUBLIC_KEY!;

let requestId = 0;
let activeStreamId: number | null = null;

// Connect with sub-protocol
const ws = new WebSocket(`${WS_URL}?auth=${AUTH_TOKEN}`, ["v1.api.titan.ag"]);
ws.binaryType = "arraybuffer";

ws.on("open", () => {
  console.log("Connected!");

  // Create stream request
  const request = {
    id: ++requestId,
    data: {
      NewSwapQuoteStream: {
        swap: {
          inputMint: bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
          outputMint: bs58.decode("So11111111111111111111111111111111111111112"),
          amount: BigInt(10_000_000),  // MUST be BigInt!
          slippageBps: 50,
        },
        transaction: {
          userPublicKey: bs58.decode(USER_PUBLIC_KEY),
        },
        update: {
          intervalMs: 1000,
          num_quotes: 3,
        },
      },
    },
  };

  ws.send(encode(request));
  console.log(`Sent request ${request.id}`);
});

ws.on("message", (data: ArrayBuffer) => {
  const msg = decode(new Uint8Array(data)) as any;

  // Handle Response (confirms stream started)
  if (msg.Response) {
    const resp = msg.Response;
    console.log(`Response for request ${resp.requestId}`);

    if (resp.stream) {
      activeStreamId = resp.stream.id;
      console.log(`Stream started: ID=${activeStreamId}, type=${resp.stream.dataType}`);
    }

    if (resp.data?.NewSwapQuoteStream) {
      console.log(`Interval: ${resp.data.NewSwapQuoteStream.intervalMs}ms`);
    }
    return;
  }

  // Handle StreamData (quote updates)
  if (msg.StreamData) {
    const { seq, payload } = msg.StreamData;
    const quotes = payload?.SwapQuotes;

    if (!quotes) return;

    console.log(`\nQuote #${seq} (id: ${quotes.id})`);

    const routes = Object.entries(quotes.quotes || {});
    if (routes.length === 0) {
      console.log("  No routes available");
      return;
    }

    for (const [providerId, route] of routes) {
      const r = route as any;
      console.log(`  ${providerId}: in=${r.inAmount}, out=${r.outAmount}`);
      if (r.transaction) {
        console.log(`    Transaction: ${r.transaction.length} bytes`);
      }
    }
    return;
  }

  // Handle StreamEnd
  if (msg.StreamEnd) {
    console.log(`Stream ${msg.StreamEnd.id} ended`);
    if (msg.StreamEnd.errorCode) {
      console.error(`  Error: [${msg.StreamEnd.errorCode}] ${msg.StreamEnd.errorMessage}`);
    }
    activeStreamId = null;
    return;
  }

  // Handle Error
  if (msg.Error) {
    console.error(`Error for request ${msg.Error.requestId}: [${msg.Error.code}] ${msg.Error.message}`);
    return;
  }
});

ws.on("close", (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason.toString()}`);
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
  if (activeStreamId !== null && ws.readyState === WebSocket.OPEN) {
    const stopRequest = {
      id: ++requestId,
      data: { StopStream: { id: activeStreamId } },
    };
    ws.send(encode(stopRequest));
  }
  setTimeout(() => ws.close(), 500);
});
```

## Raw WebSocket with Compression

```typescript
import { decompress } from "@aspect-build/zstd";

const ws = new WebSocket(
  `${WS_URL}?auth=${AUTH_TOKEN}`,
  ["v1.api.titan.ag+zstd"]  // Request zstd compression
);

ws.on("message", async (data) => {
  // Decompress before decoding
  const decompressed = await decompress(Buffer.from(data));
  const msg = decode(decompressed);
  // ... handle message
});
```

---

# Discovering Available DEXes

```typescript
// SDK
const venues = await client.getVenues();
// { labels: ["Raydium", "Whirlpool", "Phoenix", ...], programIds?: [...] }

const providers = await client.listProviders();
// [{ name: "...", kind: "DexAggregator" | "RFQ", id: "..." }, ...]
```

```typescript
// Raw WebSocket
const request = {
  id: ++requestId,
  data: { GetVenues: {} },
};
ws.send(encode(request));
// Response.data.GetVenues contains { labels: [...] }
```

---

Query server settings before streaming:

```typescript
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

# Error Handling

## SDK Error Types

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

## Reconnection Pattern

```typescript
async function connectWithRetry(maxRetries = 5): Promise<V1Client> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const client = await V1Client.connect(`${WS_URL}?auth=${AUTH_TOKEN}`);

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

# Browser Security

**CRITICAL:** Never expose API keys in browser code. Anyone can inspect browser network traffic.

**Required approach:** Backend WebSocket proxy

```
Browser → Your Backend (validates auth) → Titan API
```

### Backend Proxy Example

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
    `${process.env.WS_URL}?auth=${process.env.AUTH_TOKEN}`,
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

### Frontend Usage

```typescript
import { V1Client } from "@titanexchange/sdk-ts/browser";

// Connect to YOUR proxy, not Titan directly
const client = await V1Client.connect("wss://your-api.com/ws?token=user_session");
```

---

# Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty quotes every time | Amount not BigInt | Use `BigInt(amount)` instead of plain number |
| TypeScript error on `slippageBps` | Wrong parameter location | Put `slippageBps` inside `swap`, not at top level |
| TypeScript error on `intervalMs` | Wrong parameter location | Put `intervalMs` inside `update` object |
| `quotes.quotes` is empty | No routes found | Check amount is BigInt, then check length |
| Connection closes with 1002 | Protocol error | Ensure MessagePack encoding, not JSON |
| Token mint errors | Wrong format | Use `bs58.decode()` to convert to Uint8Array |
| Wrong amounts | Forgot decimals | USDC: ×10^6, SOL: ×10^9 |
| Quote expired | Executed too late | Check `expiresAtMs`, execute within 5 seconds |
| Simulation fails | Various | Check slippage, token accounts, compute units |

---

# Key Principles

1. **Amount must be BigInt:** `BigInt(1_000_000)` not `1_000_000`
2. **Parameter placement matters:** `slippageBps` in `swap`, `intervalMs` in `update`
3. **Always check for empty quotes:** `quotes.quotes` can be `{}`
4. **Use MessagePack:** Not JSON, not protobuf
5. **Decode mints with bs58:** Token addresses must be `Uint8Array`
6. **Simulate before sending:** Always simulate transactions first
7. **Handle reconnection:** Connections will drop
8. **Secure credentials:** Never expose API tokens in frontend

---

# Resources

- TypeScript SDK: https://github.com/Titan-Pathfinder/titan-sdk-ts
- Rust SDK: https://github.com/Titan-Pathfinder/titan-sdk-rs
- API Docs: https://titan-exchange.gitbook.io/titan/titan-developer-docs

## Support

Users can reach out in Telegram group for questions.
