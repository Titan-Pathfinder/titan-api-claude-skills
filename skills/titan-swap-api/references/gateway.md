# Titan Gateway — REST API

> Read this when the user picked Gateway in Step 2 of the agent interview, or asks anything about the Titan REST API, `/api/v1/quote/swap`, `/api/v1/quote/price`, `/api/v1/info`, `/api/v1/venues`, `/api/v1/providers`, MessagePack-encoded REST responses, or Swap V3 with Gateway. The sibling file `references/direct.md` covers the WebSocket equivalent.

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

### Swap V3 Options

Swap V3 is the newer routing version of the Titan Exchange Router (`T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT`). Titan returns V2 by default and will switch to V3 in a future release. To use V3-only fields today, opt in explicitly with `titanSwapVersion: "3"`.

- **`titanSwapVersion`** — `"3"` to opt into the V3 router. Required to unlock `payer` and `positiveSlippageFeeReceiver`.
- **`payer`** (base58) — Separate funder that covers SOL-denominated costs (network fees, ATA rent for any account the router creates such as the wSOL wrap ATA or output ATA, and the rent refund destination when the wSOL ATA is closed). **The payer must sign the transaction alongside the user.** Requires `titanSwapVersion=3`.
- **`positiveSlippageFeeReceiver`** (base58) — Token account that receives surplus when realized output exceeds the quoted `outAmount`. The skim is **capped at 10 bps of `outAmount`** — anything beyond stays with the user. **Must be a token account of the `outputMint`** (not a wallet pubkey, not a wrong-mint account) and must already exist — the router does not auto-create it. Requires `titanSwapVersion=3`.

Example V3 request body fragment (Direct `TransactionParams` shape — same field names apply to Gateway query params):

```json
{
  "transaction": {
    "userPublicKey": "72neGwRAi6QWsFQjy3PkDuYBC5GNCRwC2aUMGcrkoJuP",
    "titanSwapVersion": 3,
    "payer": "Gb4WdRjp7orviHSRz88pa3y9UkArLHR4gWWSv5HP31ZW",
    "positiveSlippageFeeReceiver": "LzEWGGE7aGC3XVqmMhiTZsByJBhr16dJpJoNY5RuWQ5"
  }
}
```

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

// Use metadata.ExpectedWinner — Titan's recommended slippage-adjusted route.
// This is preferred over sorting by raw outAmount because it factors in
// simulation results, slippage estimates, and route reliability.
const winner = quotes.metadata?.ExpectedWinner;
const route = winner && quotes.quotes[winner];

if (route?.instructions?.length) {
  console.log(`Best route: ${winner} — ${route.outAmount} out`);
  // route.instructions and route.addressLookupTables ready for transaction building
}
```

#### Picking the best route — `metadata.ExpectedWinner`

Every quote response includes a `metadata` object with an `ExpectedWinner` field. **This is Titan's recommendation for the best slippage-adjusted route** — determined by the routing engine after factoring in simulation results, slippage estimates, and route reliability. Prefer it over sorting by raw `outAmount`.

```json
{
  "metadata": { "ExpectedWinner": "Titan-DART" },
  "quotes": {
    "Titan-DART": { "outAmount": "84550000", "instructions": [...] },
    "Metis":      { "outAmount": "84520000", "instructions": [...] }
  }
}
```

```typescript
const winner = quotes.metadata?.ExpectedWinner;
const route  = winner ? quotes.quotes[winner] : undefined;
```

`ExpectedWinner` is the provider ID string (e.g. `"Titan"`, `"Titan-DART"`, `"Metis"`, `"Okx"`) keyed into the `quotes` map. It may be missing on rare updates with no eligible routes — fall back to a manual scan of `quotes` only as a defensive path, not as the default.

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
