---
name: titan-swap-api
description: Titan Swap API integration guide. Use when developers ask about streaming swap quotes, REST swap quotes, integrating with Titan DEX aggregator, or building Solana swap functionality.
version: 2.0.0
author: Titan Exchange
tags: [solana, dex, swap, websocket, rest, streaming, defi]
sdk: "@titanexchange/sdk-ts"
protocol: WebSocket + REST (MessagePack)
chain: Solana
---

## Agent Behavior

When this skill is invoked, do NOT generate any code immediately. Ask the user questions first using the AskUserQuestion tool, then act based on their answers.

**Step 1 — Credentials check:**

Ask the user:
> **Titan Swap API** skill loaded.
>
> Do you have your Titan API credentials ready? (`TITAN_ENDPOINT`, `TITAN_API_KEY`)

If no — tell them to get credentials from the Titan team before proceeding, then continue with the questions below so the setup is ready once they have them.

Note: Do NOT ask for the user's wallet public key as a credential. The wallet address is obtained at runtime from:
- Wallet adapters (`@solana/wallet-adapter-react`, Phantom, Solflare, etc.) in frontend apps
- Keypair files or env vars in backend services/bots
- The user's existing wallet setup in their codebase

When generating code, detect how the user's project handles wallets and use that. Ask only if you can't determine it from their codebase.

**Step 2 — Ask which API they want:**

Use the AskUserQuestion tool with these options:

Question: "Which Titan API do you want to use?"
- **Titan Direct (WebSocket)** — Persistent WebSocket connection with real-time streaming quotes. Best for trading bots, market makers, and latency-sensitive apps. Uses `@titanexchange/sdk-ts` or raw WebSocket with MessagePack.
- **Titan Gateway (REST)** — Standard REST endpoints returning a single set of quotes per request. Best for wallets, dApps, backend services, and existing REST architectures. No WebSocket infrastructure needed.

Explain: Both deliver the same quote quality through Titan's Argos routing engine. The difference is interface, not routing quality.

**Step 3 — Ask how they want to integrate:**

Use the AskUserQuestion tool with these options:

If they chose **Titan Direct**:
- **SDK (recommended)** — Uses `@titanexchange/sdk-ts`. Handles WebSocket connection, MessagePack encoding, and stream management for you. Best for TypeScript/Node.js projects.
- **Raw WebSocket** — Direct WebSocket connection with manual MessagePack encoding. Use when you need full control or your language doesn't have an SDK.
- **Backend proxy** — Proxy Titan's WebSocket through your own backend. Required for browser apps to keep API keys secure.
- **Into existing project** — Replace or add Titan as a swap source in a project that already has swap/trading logic.

If they chose **Titan Gateway**:
- **Quick integration** — Simple fetch calls with MessagePack decoding. Minimal setup.
- **Into existing project** — Replace or add Titan Gateway as a swap source in a project that already has swap/trading logic.

**Step 4 — Ask what they need from the API:**

Use the AskUserQuestion tool with these options:

For **Titan Direct**:
- **Stream quotes only** — Just receive live swap quotes to display prices or compare routes. No transaction execution.
- **Stream + execute swaps** — Full flow: receive quotes, pick the best, sign the transaction, send it, and confirm on-chain.
- **Multiple pairs at once** — Monitor several token pairs simultaneously with concurrent streams.

For **Titan Gateway**:
- **Get swap quotes** — Fetch executable swap quotes with transaction instructions. Full swap flow.
- **Price check only** — Lightweight price quotes without transaction data. For displaying prices.
- **Both** — Use price endpoint for display, swap endpoint for execution.

**Step 5 — If they chose "Into existing project":**

Before writing any code:
1. Ask them to point to the files where their current swap logic lives
2. Read and understand their codebase — look for how they currently fetch quotes, build transactions, sign, and send
3. Identify their current provider (Jupiter, Orca, Raydium, etc.)
4. Propose a plan showing exactly which files change and how Titan fits in
5. Wait for their approval before writing code

**Step 6 — Generate code:**

Only now generate code. Match the user's:
- Project structure and file organization
- Naming conventions (camelCase, snake_case, etc.)
- Patterns (classes vs functions, async/await vs callbacks)
- Existing error handling style
- Package manager (npm, yarn, pnpm)

Do NOT generate generic boilerplate. Every code block should be tailored to what the user told you in steps 1-5.

---

# Titan Swap API Knowledge Base

Titan is a meta-aggregator for Solana that collects swap quotes from multiple providers and routes through **Argos**, Titan's proprietary routing engine. It offers two APIs — **Titan Direct** (WebSocket) and **Titan Gateway** (REST) — with identical routing quality.

## Key Concepts

- **Meta-aggregation:** Titan routes across aggregators AND direct venues, not just individual liquidity sources
- **Providers:** Sources of quotes (DEX aggregators like Metis/Okx or RFQ providers)
- **Venues:** Individual on-chain pools (Raydium, Phoenix, Orca, Whirlpool, Meteora, PumpFun)
- **Argos:** Titan's proprietary routing algorithm — resolves price impacts with machine-level precision
- **Titan Direct:** WebSocket API for streaming live quotes updated continuously
- **Titan Gateway:** REST API for single-request quotes — same Argos routing, simpler integration

## Titan Direct vs Titan Gateway

Both route through the same Argos engine and return the same quote types. **The difference is interface, not routing quality.**

| | Titan Direct | Titan Gateway |
|---|---|---|
| Interface | WebSocket | REST |
| Quote delivery | Streaming — continuous updates | Per-request — one response per call |
| Connection | Persistent | Stateless |
| Best for | Trading bots, market makers, algo traders | Wallets, dApps, backend services |
| SDK | `@titanexchange/sdk-ts` | `fetch` + `@msgpack/msgpack` |

### API Endpoint Mapping

Every Titan Direct RPC method has a corresponding Gateway REST endpoint:

| Titan Gateway | Titan Direct |
|---|---|
| `GET /api/v1/info` | `GetInfo` |
| `GET /api/v1/providers` | `ListProviders` |
| `GET /api/v1/venues` | `GetVenues` |
| `GET /api/v1/quote/swap` | `NewSwapQuoteStream` |
| `GET /api/v1/quote/price` | `GetSwapPrice` |

## Token Amount Handling

**Token amounts:** Always raw amounts (atoms) as **BigInt**:
- 1 USDC = `BigInt(1_000_000)` (6 decimals)
- 1 SOL = `BigInt(1_000_000_000)` (9 decimals)
- 1 BONK = `BigInt(100_000)` (5 decimals)

**CRITICAL:** Amount must be passed as `BigInt` for Titan Direct, or as a string for Titan Gateway query params.

**Tip:** Consider validating amounts before encoding:

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

## Required Credentials

Users need from the Titan team:
- `TITAN_ENDPOINT` — API endpoint URL
  - For Titan Direct: `wss://...` (WebSocket)
  - For Titan Gateway: `https://...` (REST)
- `TITAN_API_KEY` — JWT authentication token

**Authentication methods:**
- **Bearer header (recommended for server-side):** `Authorization: Bearer <token>`
- **Query parameter:** `?auth=<token>` (for WebSocket or browser clients)

The user's wallet public key is NOT a Titan credential — it comes from their existing wallet setup:
- **Frontend (wallet adapter):** `wallet.publicKey` from `@solana/wallet-adapter-react` or similar
- **Backend (keypair):** `Keypair.fromSecretKey(...)` then `.publicKey`
- **Scripts/bots:** loaded from env var or keyfile

When generating code, use whichever wallet source the user's project already has. Only fall back to `process.env.USER_PUBLIC_KEY` for standalone scripts with no existing wallet setup.

---

# Titan Gateway — REST API

Titan Gateway is a REST API backed by the same Argos routing engine as Titan Direct. All responses are **MessagePack-encoded** (`application/vnd.msgpack`), not JSON.

## Installation

```bash
npm install @msgpack/msgpack
```

## Environment Setup

```env
TITAN_ENDPOINT=https://your-endpoint
TITAN_API_KEY=your_token_here
USER_PUBLIC_KEY=YourWalletPublicKeyBase58
```

## Quote Swap — `GET /api/v1/quote/swap`

Returns swap quotes with executable instructions and address lookup tables. The Gateway equivalent of Titan Direct's `NewSwapQuoteStream`.

### Required Parameters

- **`inputMint`** — Input token mint address (base58)
- **`outputMint`** — Output token mint address (base58)
- **`amount`** — Amount in the smallest unit (e.g. lamports for SOL). String, not scaled by decimals.
- **`userPublicKey`** — Wallet public key (base58). Required for instruction generation.

### Swap Options

- **`slippageBps`** — Slippage tolerance in basis points (e.g. `"50"` = 0.5%)
- **`dexes`** — Comma-separated venue labels to include (e.g. `"Raydium,Phoenix"`)
- **`excludeDexes`** — Comma-separated venue labels to exclude
- **`providers`** — Comma-separated provider IDs (e.g. `"Titan,Metis"`)
- **`onlyDirectRoutes`** — `"true"` to skip multi-hop routes
- **`addSizeConstraint`** — `"true"` to enforce transaction size limit
- **`sizeConstraint`** — Custom max transaction size in bytes
- **`accountsLimitTotal`** — Max total accounts per route (default: 256)
- **`accountsLimitWritable`** — Max writable accounts per route (default: 64)

### Transaction Options

- **`feeAccount`** — Token account for collecting platform fees (base58, must exist on-chain)
- **`feeBps`** — Fee amount in basis points
- **`feeFromInputMint`** — `"true"` to take fee from input mint (default: output mint)
- **`closeInputTokenAccount`** — `"true"` to close input token account after swap
- **`createOutputTokenAccount`** — `"true"` to add ATA creation instruction
- **`outputAccount`** — Custom output token account (base58)

### Performance Options

- **`simulate`** — `"true"` (default) or `"false"`. Set to `"false"` to skip simulations and reduce latency.
- **`maxPriceDeviationBps`** — Max deviation from reference price (default: `1000` = 10%). Set `10000`+ to disable price checking.

### Example — Swap Quote

```typescript
import { Decoder } from '@msgpack/msgpack';

// useBigInt64 required — amounts and timestamps are u64
const decoder = new Decoder({ useBigInt64: true });

// 1 SOL -> USDC swap quote
const params = new URLSearchParams({
  inputMint: 'So11111111111111111111111111111111111111112',   // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: '1000000000',          // 1 SOL in lamports
  userPublicKey: 'YOUR_WALLET_PUBLIC_KEY',
  slippageBps: '50',             // 0.5% slippage tolerance
});

const res = await fetch(
  `${process.env.TITAN_ENDPOINT}/api/v1/quote/swap?${params}`,
  {
    headers: {
      'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
      'Accept': 'application/vnd.msgpack',
    },
  }
);

if (!res.ok) {
  throw new Error(`${res.status}: ${res.statusText}`);
}

// Decode the MessagePack response
const buffer = await res.arrayBuffer();
const quotes = decoder.decode(new Uint8Array(buffer)) as any;

// Pick the best quote by highest output amount
const best = Object.entries(quotes.quotes as Record<string, any>)
  .filter(([, r]) => r.instructions?.length)
  .sort(([, a], [, b]) => Number(BigInt(b.outAmount) - BigInt(a.outAmount)))[0];

if (best) {
  const [provider, route] = best;
  console.log(`Best: ${provider} — ${route.outAmount} out`);
  // route.instructions and route.addressLookupTables ready for transaction building
}
```

### Full Transaction Flow with Titan Gateway

```typescript
import { Decoder } from '@msgpack/msgpack';
import {
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  PublicKey,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import bs58 from 'bs58';

const decoder = new Decoder({ useBigInt64: true });
const connection = new Connection(process.env.RPC_URL!, 'confirmed');
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));

// 1. Fetch swap quote from Titan Gateway
const params = new URLSearchParams({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000000',
  userPublicKey: wallet.publicKey.toBase58(),
  slippageBps: '50',
});

const res = await fetch(
  `${process.env.TITAN_ENDPOINT}/api/v1/quote/swap?${params}`,
  {
    headers: {
      'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
      'Accept': 'application/vnd.msgpack',
    },
  }
);

if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);

const data = decoder.decode(new Uint8Array(await res.arrayBuffer())) as any;

// 2. Pick best route
const routes = Object.entries(data.quotes as Record<string, any>)
  .filter(([, r]) => r.instructions?.length)
  .sort(([, a], [, b]) => Number(BigInt(b.outAmount) - BigInt(a.outAmount)));

if (!routes.length) throw new Error('No routes found');

const [provider, route] = routes[0];
console.log(`Using ${provider}: ${route.outAmount} out`);

// 3. Build transaction from instructions
// Convert compact instruction format { p, a, d } to TransactionInstruction
const instructions = route.instructions.map((ix: any) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.p),
    keys: ix.a.map((acc: any) => ({
      pubkey: new PublicKey(acc.p),
      isSigner: acc.s,
      isWritable: acc.w,
    })),
    data: Buffer.from(ix.d),
  })
);

// 4. Fetch address lookup tables
const altAccounts: AddressLookupTableAccount[] = [];
if (route.addressLookupTables?.length) {
  const altAddresses = route.addressLookupTables.map(
    (alt: Uint8Array) => new PublicKey(alt)
  );
  const altResults = await connection.getMultipleAccountsInfo(altAddresses);
  for (let i = 0; i < altAddresses.length; i++) {
    if (altResults[i]) {
      altAccounts.push(
        new AddressLookupTableAccount({
          key: altAddresses[i],
          state: AddressLookupTableAccount.deserialize(altResults[i]!.data),
        })
      );
    }
  }
}

// 5. Compile V0 transaction
const { blockhash } = await connection.getLatestBlockhash();
const messageV0 = new TransactionMessage({
  payerKey: wallet.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message(altAccounts);

const tx = new VersionedTransaction(messageV0);

// 6. Simulate
const sim = await connection.simulateTransaction(tx, {
  sigVerify: false,
  replaceRecentBlockhash: true,
});
if (sim.value.err) {
  console.error('Simulation failed:', sim.value.err, sim.value.logs);
  process.exit(1);
}

// 7. Sign and send
tx.sign([wallet]);
const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,
  maxRetries: 3,
});
console.log(`Sent: ${signature}`);

// 8. Confirm
const confirmation = await connection.confirmTransaction(
  { signature, ...(await connection.getLatestBlockhash()) },
  'confirmed'
);
if (confirmation.value.err) {
  console.error('Failed on-chain:', confirmation.value.err);
} else {
  console.log(`Confirmed: ${signature}`);
}
```

### Error Responses

- **`400`** — Invalid parameters (malformed pubkey, missing required field, value out of bounds)
- **`401`** — Missing or invalid authentication token
- **`404`** — No routes found for this swap pair (try relaxing routing constraints)

---

## Quote Price — `GET /api/v1/quote/price`

Lightweight price-only quotes without transaction data. Use for displaying prices.

### Required Parameters

- **`inputMint`** — Input token mint address (base58)
- **`outputMint`** — Output token mint address (base58)
- **`amount`** — Amount in the smallest unit

### Routing Options

- **`dexes`** — Comma-separated venue labels to include
- **`excludeDexes`** — Comma-separated venue labels to exclude

**Note:** This endpoint does NOT accept `userPublicKey`, `feeAccount`, or any transaction parameters.

### Example — Price Check

```typescript
import { Decoder } from '@msgpack/msgpack';

const decoder = new Decoder({ useBigInt64: true });

const params = new URLSearchParams({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000000',
});

const res = await fetch(
  `${process.env.TITAN_ENDPOINT}/api/v1/quote/price?${params}`,
  {
    headers: {
      'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
      'Accept': 'application/vnd.msgpack',
    },
  }
);

if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);

const price = decoder.decode(new Uint8Array(await res.arrayBuffer())) as any;
console.log('Output amount:', price.amountOut);
```

### Price Response Structure

```typescript
interface SwapPrice {
  id: string;
  inputMint: Uint8Array;   // 32-byte Pubkey
  outputMint: Uint8Array;  // 32-byte Pubkey
  amountIn: bigint;
  amountOut: bigint;
}
```

---

## Discovery Endpoints

### Server Info — `GET /api/v1/info`

Returns protocol version and configurable parameter bounds.

```typescript
const res = await fetch(`${process.env.TITAN_ENDPOINT}/api/v1/info`, {
  headers: {
    'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
    'Accept': 'application/vnd.msgpack',
  },
});

const info = decoder.decode(new Uint8Array(await res.arrayBuffer())) as any;
console.log('Protocol version:', info.protocolVersion);
console.log('Default update interval:', info.settings.quoteUpdate.intervalMs.default, 'ms');
```

### Venues — `GET /api/v1/venues`

Returns available on-chain venues for routing. Optional param: `includeProgramIds=true`.

```typescript
const res = await fetch(
  `${process.env.TITAN_ENDPOINT}/api/v1/venues?includeProgramIds=true`,
  {
    headers: {
      'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
      'Accept': 'application/vnd.msgpack',
    },
  }
);

const venues = decoder.decode(new Uint8Array(await res.arrayBuffer())) as any;
console.log('Available venues:', venues.labels);
// e.g. ['Raydium', 'Whirlpool', 'Phoenix', 'Meteora', ...]
```

### Providers — `GET /api/v1/providers`

Returns active quote providers. Optional param: `includeIcons=true`.

```typescript
const res = await fetch(`${process.env.TITAN_ENDPOINT}/api/v1/providers`, {
  headers: {
    'Authorization': `Bearer ${process.env.TITAN_API_KEY}`,
    'Accept': 'application/vnd.msgpack',
  },
});

const providers = decoder.decode(new Uint8Array(await res.arrayBuffer())) as any[];
for (const p of providers) {
  console.log(`${p.name} (${p.id}) — ${p.kind}`);
  // e.g. "Titan (Titan) — DexAggregator"
}
```

---

# Titan Direct — WebSocket API

Titan Direct is a WebSocket API for real-time streaming swap quotes with pre-built transactions.

## How Titan Direct Works

**Connection:** WebSocket protocol at `wss://[endpoint]/api/v1/ws?auth=[token]`

**Protocol:** MessagePack binary encoding (NOT JSON or protobuf)

**Sub-protocols:** `v1.api.titan.ag`, `v1.api.titan.ag+zstd`, `v1.api.titan.ag+brotli`, `v1.api.titan.ag+gzip`

**Primary mode:** `newSwapQuoteStream()` - Continuous quote streaming with pre-built transactions

---

## Option 1: SDK Integration

### Installation

```bash
npm install @titanexchange/sdk-ts bs58 dotenv
```

Requires Node.js >=18.19. For browser: `import { V1Client } from "@titanexchange/sdk-ts/browser"`

### Environment Setup

Create a `.env` file:
```env
TITAN_ENDPOINT=wss://api.titan.ag/api/v1/ws
TITAN_API_KEY=your_token_here
USER_PUBLIC_KEY=YourWalletPublicKeyBase58
```

Load in code:
```typescript
import "dotenv/config";
```

### Connection Pattern

```typescript
import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";

const client = await V1Client.connect(`${process.env.TITAN_ENDPOINT}?auth=${process.env.TITAN_API_KEY}`);

// Monitor connection state
client.listen_closed().then(() => {
  console.log("Connection closed, implement reconnection");
});

// Always close when done
await client.close();
```

### Streaming Quotes (Primary Use Case)

#### Basic Streaming Setup

```typescript
import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

const client = await V1Client.connect(`${process.env.TITAN_ENDPOINT}?auth=${process.env.TITAN_API_KEY}`);

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

#### CRITICAL: Parameter Structure

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

#### Full Parameter Reference

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

#### Stream Response Structure

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

#### Getting Transaction Data from Quotes

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

The `route.transaction` field contains the serialized transaction bytes.

#### Full Transaction Flow: Deserialize, Sign, Send, Confirm

Complete end-to-end example from quote stream to confirmed transaction:

```typescript
import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  SendTransactionError,
} from "@solana/web3.js";
import bs58 from "bs58";

const connection = new Connection(process.env.RPC_URL!, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));
const client = await V1Client.connect(`${process.env.TITAN_ENDPOINT}?auth=${process.env.TITAN_API_KEY}`);

const { stream, streamId } = await client.newSwapQuoteStream({
  swap: {
    inputMint: bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    outputMint: bs58.decode("So11111111111111111111111111111111111111112"),
    amount: BigInt(10_000_000),
    slippageBps: 50,
  },
  transaction: {
    userPublicKey: wallet.publicKey.toBytes(),
  },
  update: { intervalMs: 1000, num_quotes: 3 },
});

for await (const quotes of stream) {
  const routes = Object.values(quotes.quotes);
  if (routes.length === 0) continue;

  // Pick best route by highest output amount
  const bestRoute = routes.reduce((best, r) =>
    r.outAmount > best.outAmount ? r : best
  );

  // Skip expired quotes
  if (bestRoute.expiresAtMs && Date.now() > bestRoute.expiresAtMs) continue;
  if (!bestRoute.transaction) continue;

  // 1. Deserialize
  const tx = VersionedTransaction.deserialize(bestRoute.transaction);

  // 2. Simulate first
  const simulation = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  if (simulation.value.err) {
    console.error("Simulation failed:", simulation.value.err);
    console.error("Logs:", simulation.value.logs);
    continue; // Wait for next quote
  }

  // 3. Sign
  tx.sign([wallet]);

  // 4. Send
  try {
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true, // Already simulated
      maxRetries: 3,
    });
    console.log(`Sent: ${signature}`);

    // 5. Confirm
    const confirmation = await connection.confirmTransaction(
      { signature, ...(await connection.getLatestBlockhash()) },
      "confirmed"
    );

    if (confirmation.value.err) {
      console.error("Transaction failed on-chain:", confirmation.value.err);
    } else {
      console.log(`Confirmed: ${signature}`);
    }
  } catch (err) {
    if (err instanceof SendTransactionError) {
      console.error("Send failed:", err.message);
      // Transaction may have landed anyway — check signature status
    }
    throw err;
  }

  await client.stopStream(streamId);
  break;
}

await client.close();
```

**Key points for transaction execution:**
- Always simulate before sending to catch errors early
- Use `skipPreflight: true` after successful simulation to avoid double-checking
- Quotes expire — check `expiresAtMs` and execute within seconds
- Use `computeUnitsSafe` from the route if you need to set compute budget manually
- The transaction already includes the correct recent blockhash from Titan

---

## Multi-Stream Management

For partners running multiple token pairs simultaneously (e.g., monitoring SOL/USDC, SOL/USDT, BONK/SOL at once):

### Concurrent Streams with SDK

```typescript
import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

const client = await V1Client.connect(`${process.env.TITAN_ENDPOINT}?auth=${process.env.TITAN_API_KEY}`);
const userPublicKey = bs58.decode(process.env.USER_PUBLIC_KEY!);

// Check server limits first
const info = await client.getInfo();
const maxStreams = info.settings.connection.concurrentStreams;
console.log(`Max concurrent streams: ${maxStreams}`);

// Define pairs to monitor
const pairs = [
  {
    name: "USDC->SOL",
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    outputMint: "So11111111111111111111111111111111111111112",
    amount: BigInt(10_000_000),
  },
  {
    name: "USDT->SOL",
    inputMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    outputMint: "So11111111111111111111111111111111111111112",
    amount: BigInt(10_000_000),
  },
  {
    name: "SOL->USDC",
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amount: BigInt(1_000_000_000),
  },
];

if (pairs.length > maxStreams) {
  console.error(`Too many pairs (${pairs.length}), server allows ${maxStreams}`);
  process.exit(1);
}

// Track active streams for cleanup
const activeStreams: Map<number, string> = new Map();

// Start all streams concurrently
const streamPromises = pairs.map(async (pair) => {
  const { stream, streamId } = await client.newSwapQuoteStream({
    swap: {
      inputMint: bs58.decode(pair.inputMint),
      outputMint: bs58.decode(pair.outputMint),
      amount: pair.amount,
      slippageBps: 50,
    },
    transaction: { userPublicKey },
    update: { intervalMs: 2000, num_quotes: 3 },
  });

  activeStreams.set(streamId, pair.name);
  console.log(`Stream ${streamId} started for ${pair.name}`);

  for await (const quotes of stream) {
    const routes = Object.values(quotes.quotes);
    if (routes.length === 0) continue;

    const best = routes.reduce((a, b) => (a.outAmount > b.outAmount ? a : b));
    console.log(`[${pair.name}] Best: ${best.outAmount} (${routes.length} routes)`);
  }
});

// Handle graceful shutdown — stop all streams
async function shutdown() {
  console.log("Stopping all streams...");
  for (const [streamId, name] of activeStreams) {
    await client.stopStream(streamId);
    console.log(`Stopped ${name} (stream ${streamId})`);
  }
  await client.close();
}

process.on("SIGINT", shutdown);

// Wait for all streams (they run until stopped)
await Promise.allSettled(streamPromises);
```

### Stream Lifecycle Management

```typescript
// Dynamically add/remove streams at runtime
class StreamManager {
  private client: V1Client;
  private streams: Map<string, { streamId: number; stop: () => Promise<void> }> = new Map();

  constructor(client: V1Client) {
    this.client = client;
  }

  async addPair(
    name: string,
    inputMint: string,
    outputMint: string,
    amount: bigint,
    onQuote: (name: string, routes: any[]) => void
  ) {
    if (this.streams.has(name)) {
      await this.removePair(name);
    }

    const { stream, streamId } = await this.client.newSwapQuoteStream({
      swap: {
        inputMint: bs58.decode(inputMint),
        outputMint: bs58.decode(outputMint),
        amount,
        slippageBps: 50,
      },
      transaction: { userPublicKey: bs58.decode(process.env.USER_PUBLIC_KEY!) },
      update: { intervalMs: 1000, num_quotes: 3 },
    });

    // Process in background
    const processing = (async () => {
      for await (const quotes of stream) {
        const routes = Object.values(quotes.quotes);
        if (routes.length > 0) onQuote(name, routes);
      }
    })();

    this.streams.set(name, {
      streamId,
      stop: async () => {
        await this.client.stopStream(streamId);
        await processing.catch(() => {}); // Stream ends after stop
      },
    });
  }

  async removePair(name: string) {
    const entry = this.streams.get(name);
    if (entry) {
      await entry.stop();
      this.streams.delete(name);
    }
  }

  async stopAll() {
    for (const name of this.streams.keys()) {
      await this.removePair(name);
    }
  }

  get activePairs(): string[] {
    return [...this.streams.keys()];
  }
}

// Usage:
const manager = new StreamManager(client);

await manager.addPair("USDC->SOL", "EPjF...", "So111...", BigInt(10_000_000), (name, routes) => {
  console.log(`[${name}] ${routes.length} routes, best: ${routes[0].outAmount}`);
});

// Later: dynamically add another pair
await manager.addPair("SOL->USDC", "So111...", "EPjF...", BigInt(1_000_000_000), (name, routes) => {
  console.log(`[${name}] ${routes.length} routes`);
});

// Remove a pair without affecting others
await manager.removePair("USDC->SOL");
```

---

## Option 2: Raw WebSocket Integration (No SDK)

For languages without SDK support or when you need full control, connect directly via WebSocket.

### Protocol Overview

- **Transport:** WebSocket with binary messages
- **Encoding:** MessagePack (use `@msgpack/msgpack` in Node.js)
- **Sub-protocol:** Must specify `v1.api.titan.ag` (or with compression suffix)

### Installation

```bash
npm install ws @msgpack/msgpack bs58 dotenv
```

### Message Format

All messages are MessagePack-encoded objects.

#### Client Request Structure

```typescript
interface ClientRequest {
  id: number;              // Unique request ID (increment for each request)
  data: RequestData;       // Request payload
}

type RequestData =
  | { NewSwapQuoteStream: SwapQuoteRequest }
  | { StopStream: { id: number } }
  | { GetInfo: {} }
  | { GetSwapPrice: SwapPriceRequest }
  | { GetVenues: {} }
  | { ListProviders: {} };
```

#### Server Response Types

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

### Complete Raw WebSocket Example

```typescript
import "dotenv/config";
import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";
import bs58 from "bs58";

const TITAN_ENDPOINT = process.env.TITAN_ENDPOINT!;
const TITAN_API_KEY = process.env.TITAN_API_KEY!;
const USER_PUBLIC_KEY = process.env.USER_PUBLIC_KEY!;

let requestId = 0;
let activeStreamId: number | null = null;

// Connect with sub-protocol
const ws = new WebSocket(`${TITAN_ENDPOINT}?auth=${TITAN_API_KEY}`, ["v1.api.titan.ag"]);
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

### Raw WebSocket with Compression

```typescript
import { decompress } from "@aspect-build/zstd";

const ws = new WebSocket(
  `${TITAN_ENDPOINT}?auth=${TITAN_API_KEY}`,
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

# Configuring Routing

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

# Fee Collection

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

# Error Handling

## SDK Error Types (Titan Direct)

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

## Titan Gateway Error Handling

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

## Reconnection Pattern (Titan Direct)

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

# Browser Security

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

---

# Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty quotes every time | Amount not BigInt (Direct) or wrong format (Gateway) | Direct: Use `BigInt(amount)`. Gateway: Use string `"1000000000"` |
| TypeScript error on `slippageBps` | Wrong parameter location | Put `slippageBps` inside `swap`, not at top level |
| TypeScript error on `intervalMs` | Wrong parameter location | Put `intervalMs` inside `update` object |
| `quotes.quotes` is empty | No routes found | Check amount format, then check length |
| Connection closes with 1002 | Protocol error | Ensure MessagePack encoding, not JSON |
| Token mint errors | Wrong format | Direct: use `bs58.decode()` for Uint8Array. Gateway: use base58 string |
| Wrong amounts | Forgot decimals | USDC: x10^6, SOL: x10^9 |
| Quote expired | Executed too late | Check `expiresAtMs`, execute within 5 seconds |
| Simulation fails | Various | Check slippage, token accounts, compute units |
| Gateway 404 | No routes | Try relaxing `dexes`, `excludeDexes`, `onlyDirectRoutes` constraints |
| Gateway response unreadable | Decoding as JSON | Response is MessagePack — use `@msgpack/msgpack` decoder |

---

# Key Principles

1. **Two APIs, same quality:** Titan Direct (WebSocket) and Titan Gateway (REST) both use Argos routing
2. **Amount format matters:** BigInt for Direct, string for Gateway query params
3. **Parameter placement matters:** `slippageBps` in `swap`, `intervalMs` in `update` (Direct only)
4. **Always check for empty quotes:** `quotes.quotes` can be `{}`
5. **MessagePack everywhere:** Both APIs use MessagePack encoding, never JSON
6. **Token mints:** Direct uses `Uint8Array` (bs58.decode), Gateway uses base58 strings
7. **Simulate before sending:** Always simulate transactions first
8. **Handle reconnection:** Direct connections will drop — implement retry logic
9. **Secure credentials:** Never expose API tokens in frontend code

---

# Wire Protocol Reference

## MessagePack Encoding Conventions

- **Objects:** Encoded as maps with camelCase field names
- **Integers:** Smallest type that fits the value
- **BigInt (u64):** For token amounts and timestamps
- **Binary data:** MessagePack bin format for pubkeys (32-byte)
- **Simple enums:** Encoded as strings (e.g. `"ExactIn"`, `"ExactOut"`)
- **Complex enums:** Single-value maps (e.g. `{ "NewSwapQuoteStream": { ... } }`)
- **Optional fields:** Omitted or encoded as nil

## Compact Instruction Format

Both Titan Direct and Titan Gateway use compact field names for instructions:

```typescript
// Instruction: { p: programId, a: accounts, d: data }
// AccountMeta: { p: pubkey, s: isSigner, w: isWritable }

interface Instruction {
  p: Uint8Array;       // Program ID (32-byte Pubkey)
  a: AccountMeta[];    // Account list
  d: Uint8Array;       // Instruction data
}

interface AccountMeta {
  p: Uint8Array;       // Account public key
  s: boolean;          // Is signer
  w: boolean;          // Is writable
}
```

## Gateway Response Differences

- REST with query params uses **base58 strings** for pubkeys instead of binary
- Responses are still **MessagePack-encoded** (`application/vnd.msgpack`)
- Set `Accept: application/vnd.msgpack` header
- Use `Decoder({ useBigInt64: true })` for proper u64 handling

---

# Resources

- TypeScript SDK: https://github.com/Titan-Pathfinder/titan-sdk-ts
- Rust SDK: https://github.com/Titan-Pathfinder/titan-sdk-rs
- API Docs: https://titan-exchange.gitbook.io/titan/titan-developer-docs

## Support

Users can reach out in Telegram group for questions.
