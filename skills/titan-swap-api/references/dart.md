# Titan DART Public API — JSON REST

> Read this when the user picked the DART Public API in Step 2, or asks anything about `https://api.titan.exchange/dart`, the DART JSON endpoint, the free 1 req/sec tier, or DART-specific routing without Argos.

The **DART Swap API** is a free public JSON REST endpoint that exclusively uses Titan's DART (Dynamically Allocated Real Time) on-chain routing engine. Unlike Gateway/Direct, it is plain JSON (no MessagePack), no WebSocket, and **no API key required** for the public tier.

> **Beta** — the DART API is currently in beta.

| | DART Public API |
|---|---|
| Base URL | `https://api.titan.exchange/dart` |
| Protocol | JSON over HTTP |
| Auth | None for public tier (1 req/sec). Optional API key for higher rate limits. |
| Provider | `Titan-DART` only |
| Pairs | Curated allowlist — call `GET /markets` for the live list (examples: SOL/USDC, SOL/USDT, USDT/USDC, cbBTC/USDC, wETH/USDC, plus several memecoin and stablecoin pairs). |
| Fees | Up to 1 bps per swap |
| Rate limit | 1 req/sec per IP (public). HTTP 429 if exceeded. |

**When to use it:**
- You only care about DART routing on a supported pair and want the BBO guarantee at execution time.
- You're testing without Titan credentials.
- You want a plain-JSON integration without MessagePack tooling.

**When NOT to use it:**
- You need quotes across all providers (use Gateway/Direct — they include DART as one provider plus everything else, and `metadata.ExpectedWinner` will pick `Titan-DART` when it's the best route anyway).
- You need >1 req/sec without a partner key.
- You need pairs outside the supported list.

## Endpoints

### `GET /health`

```bash
curl https://api.titan.exchange/dart/health
# { "status": "ok" }
```

### `GET /markets`

Programmatic discovery of supported pairs.

```bash
curl https://api.titan.exchange/dart/markets
```

```json
{
  "markets": [
    {
      "name": "SOL/USDC",
      "tokenA": "So11111111111111111111111111111111111111112",
      "tokenB": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    }
  ]
}
```

### `POST /swap`

Returns transaction-ready instructions with compute budget instructions pre-prepended.

**Request body (JSON):**

| Field | Type | Required | Notes |
|---|---|---|---|
| `inputMint` | string (base58) | yes | Input token mint |
| `outputMint` | string (base58) | yes | Output token mint |
| `amount` | string | yes | Raw amount in smallest unit (e.g. lamports). String, not number. |
| `userPublicKey` | string (base58) | yes | Wallet pubkey. Must be on-curve. |
| `slippageBps` | number | no | Default `50` |
| `computeUnitPrice` | number | no | microLamports. Default `10000`. |
| `includeDexes` | string[] | no | Only use these venues |
| `excludeDexes` | string[] | no | Exclude these venues |

```bash
curl -X POST https://api.titan.exchange/dart/swap \
  -H "Content-Type: application/json" \
  -d '{
    "inputMint":  "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount":     "1000000000",
    "userPublicKey": "YourWalletPublicKeyHere",
    "slippageBps": 50
  }'
```

**Response:**

```json
{
  "outputAmount": "84550000",
  "inputAmount":  "1000000000",
  "provider":     "Titan-DART",
  "slippageBps":  50,
  "instructions": [
    { "programId": "ComputeBudget111111111111111111111111111111", "accounts": [], "data": "AQAABAA=" },
    { "programId": "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT",
      "accounts": [{ "pubkey": "YourWalletPublicKeyHere", "isSigner": true, "isWritable": true }],
      "data": "..." }
  ],
  "addressLookupTables": ["RyXhBMnPkYJyWEkBmYAnW7A8LCKfrEgAABB2xVZrwy3"]
}
```

| Field | Notes |
|---|---|
| `outputAmount` / `inputAmount` | Smallest unit, string. |
| `provider` | Always `Titan-DART`. |
| `instructions[].programId` | base58 |
| `instructions[].accounts[].pubkey` | base58 |
| `instructions[].data` | **base64** (not bs58, not hex) |
| `addressLookupTables` | base58 ALT keys for V0 message compilation |

**Compute budget pre-prepended automatically:**
- `requestHeapFrame` — 256 KB
- `setComputeUnitLimit` — 1,400,000 CUs
- `setComputeUnitPrice` — configurable (default 10,000 µLamports via `computeUnitPrice`)

**Errors:**
- `400` — missing required field or invalid JSON
- `404` — no route found for the pair (likely unsupported pair — check `/markets`)
- `429` — rate limit exceeded (1 req/sec on the public tier)

## Building the transaction

Deserialize the JSON instructions, fetch ALTs, compile a V0 message, sign, send:

```typescript
import {
  Connection, PublicKey, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";

const response = await fetch("https://api.titan.exchange/dart/swap", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inputMint:  "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amount:     "1000000000",
    userPublicKey: wallet.publicKey.toBase58(),
    slippageBps: 50,
  }),
}).then(r => r.json());

// 1. Deserialize instructions — `data` is base64
const instructions = response.instructions.map((ix: any) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a: any) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  })
);

// 2. Fetch ALTs
const connection = new Connection(process.env.RPC_URL!);
const alts = (await Promise.all(
  response.addressLookupTables.map((k: string) =>
    connection.getAddressLookupTable(new PublicKey(k)).then(r => r.value)
  )
)).filter(Boolean);

// 3. Compile V0
const { blockhash } = await connection.getLatestBlockhash();
const message = new TransactionMessage({
  payerKey: wallet.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message(alts as any);

const tx = new VersionedTransaction(message);
tx.sign([wallet]);
const sig = await connection.sendTransaction(tx);
```

## Higher rate limits — partner API key

The free public tier is capped at **1 request per second per IP**. If the user needs more throughput on a DART-only path, surface this clearly: they need a partner DART API key from the Titan team. Apply at <https://tally.so/r/1AvYeL>, or recommend they contact the team directly.

Once they have a key, pass it via either header:

```bash
curl -X POST https://api.titan.exchange/dart/swap \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" -d '{ ... }'

# or
curl -X POST https://api.titan.exchange/dart/swap \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" -d '{ ... }'
```

> **Tip:** Before sending the user to apply for a DART-only key, consider whether they actually want one. Gateway and Direct already include DART as one of their providers, and `metadata.ExpectedWinner` will pick `Titan-DART` automatically when it's the best route — so a higher-tier general Titan API key is often a simpler path.

## DART vs `metadata.ExpectedWinner`

DART's `/swap` always returns `provider: "Titan-DART"` because this endpoint is DART-only. There's no `metadata.ExpectedWinner` here — there are no other providers to compare against. For cross-provider winner selection, use Gateway or Direct, where `ExpectedWinner` will name `Titan-DART` whenever DART is the best route.
