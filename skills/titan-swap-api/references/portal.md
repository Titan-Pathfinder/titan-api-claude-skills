# Titan Developers Portal — self-serve REST

The Developers Portal is the self-serve way to use Titan: sign in at <https://developer.titan.exchange/>, create an API key, and call `portal.api.titan.exchange` over REST. It is Titan Gateway behind a key instead of a JWT — same routing engine as Titan Direct and every distributor, same quote shape — with two practical differences that trip people up:

1. **Auth is an `x-api-key` header**, not `Authorization: Bearer`. A distributor JWT sent here returns `401 invalid_api_key`, and a Portal key sent to a distributor endpoint fails the same way.
2. **JSON is available.** Send `Accept: application/json`. Without it the Portal answers in MessagePack, which looks like binary garbage if you `res.json()` it.

Use this reference when the user has (or will get) a key from the Portal, mentions `portal.api.titan.exchange`, `x-api-key`, plans/credits, or `rate_limited` / `allowance_exhausted`.

## Base URL and endpoints

```text
https://portal.api.titan.exchange
```

One hostname for every plan. Requests go to the nearest of three regions (Virginia `us-east-1`, Frankfurt `eu-central-1`, Tokyo `ap-northeast-1`) automatically — there is no regional hostname. Deploying in or near one of those regions gives the lowest latency.

All four endpoints are `GET`:

| Endpoint | Returns |
|---|---|
| `/api/v1/quote/swap` | Quoted routes with executable instructions |
| `/api/v1/info` | Protocol version and parameter bounds; also the cheapest way to verify a key |
| `/api/v1/venues` | Venue labels usable in `dexes` / `excludeDexes` (`?includeProgramIds=true` for program IDs) |
| `/api/v1/providers` | Providers currently quoting: `Titan` and `Titan-DART` |

There is **no WebSocket** on the Portal: `/api/v1/ws` does not exist. Streaming (Titan Direct) is Enterprise-only and delivered through distributors — see `direct.md`.

Every request carries:

```typescript
const headers = {
  'x-api-key': process.env.TITAN_API_KEY!,
  Accept: 'application/json',
};
```

## Verify the key first

```typescript
const res = await fetch('https://portal.api.titan.exchange/api/v1/info', { headers });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
```

`401 {"error":{"code":"invalid_api_key"}}` means the key is missing, unknown or revoked — **or** it is a distributor JWT / it is pointed at the wrong host. Check the hostname before rotating a key.

## Quote: `GET /api/v1/quote/swap`

Every parameter is a **flat query string value**; lists are comma-separated. (Titan Direct nests the same fields inside `swap` / `transaction` objects — names and behavior are identical.)

| Titan Direct | Portal |
|---|---|
| `swap.dexes: ["Raydium", "Phoenix"]` | `?dexes=Raydium,Phoenix` |
| `swap.onlyDirectRoutes: true` | `?onlyDirectRoutes=true` |
| `transaction.createOutputTokenAccount: false` | `?createOutputTokenAccount=false` |

### Required

| Param | Type | Notes |
|---|---|---|
| `inputMint` | pubkey (base58) | Token sold |
| `outputMint` | pubkey (base58) | Token bought |
| `amount` | u64 as string | Smallest units of `inputMint` (lamports, micro-USDC). Not decimal-scaled |
| `userPublicKey` | pubkey (base58) | Wallet that will sign. Instructions are built for its token accounts — a different signer fails |

### Common optional

| Param | Default | Notes |
|---|---|---|
| `slippageBps` | `100` | Bounds from `/api/v1/info` |
| `numQuotes` | `1` | Max `10`. **Set it to `5`+** or you only ever see one provider |
| `providers` | all | IDs from `/api/v1/providers` |
| `dexes` / `excludeDexes` | all / — | Labels from `/api/v1/venues`. An unknown label yields `404 -7`, not `400` |
| `venueAllowlist` / `venueBanlist` | — | Pool addresses; banlist overrides allowlist |
| `onlyDirectRoutes` | `false` | Single hop only |
| `includeAltContents` | `false` | Inline lookup-table contents in a top-level `alts` array — saves an RPC round trip per table |
| `createOutputTokenAccount` | `true` | Idempotent create-ATA for the output |
| `closeInputTokenAccount` | `false` | |
| `outputAccount` | user's ATA | Send output elsewhere |
| `outputWsol` | `false` | Keep wSOL output wrapped (V3) |
| `payer` | — | Separate fee/rent payer; must also sign (V3) |
| `positiveSlippageFeeReceiver` | — | Output-mint token account receiving surplus, capped at 10 bps of `outAmount` (V3) |
| `titanSwapVersion` | `3` | `2` selects the previous program |
| `transactionFormat` | `0` | `1` = Transaction V1 (cluster support + V3 required) |
| `simulate` | `true` | `false` trades the pre-flight check for latency |
| `maxPriceDeviationBps` | `1000` | `10000`+ disables |
| `addSizeConstraint` / `sizeConstraint` | `true` / `1168` | Only routes that fit the tx size |
| `accountsLimitTotal` / `accountsLimitWritable` | — / `64` | |
| `transactionTemplate` | — | Reserve room for your own instructions; incompatible with the three size params |

### Response

```json
{
  "id": "swap:2afe554d-...:0",
  "quotes": {
    "Titan":      { "inAmount": 1000000000, "outAmount": 100781959, "slippageBps": 50, "instructions": [ ... ], "addressLookupTables": [ "9Re4..." ], "computeUnits": 85743, "computeUnitsSafe": 171486, "contextSlot": 447800832, "steps": [ ... ] },
    "Titan-DART": { "inAmount": 1000000000, "outAmount": 100772613, "instructions": [ ... ], "computeUnitsSafe": 1400000, "referenceId": "titan_dart", "steps": [] }
  },
  "metadata": { "ExpectedWinner": "Titan-DART", "inputMintDecimals": 9, "outputMintDecimals": 6, "inputPriceUSD": 100.51, "outputPriceUSD": 0.9998 },
  "alts": [ { "p": "9Re4...", "a": [ "..." ] } ]
}
```

- **`quotes` is an object keyed by provider ID, not an array.** `quotes[0]` is `undefined`.
- **Execute `quotes[metadata.ExpectedWinner]`.** It is the best slippage-adjusted route; the highest `outAmount` is not reliably the best fill.
- Instructions use short names: `{ p: programId, a: [{ p: pubkey, s: isSigner, w: isWritable }], d: data }`. In JSON, **`d` is base64**; in MessagePack it is raw bytes.
- Some providers include a compute-budget instruction and some don't. If none targets `ComputeBudget111111111111111111111111111111`, add one with `computeUnitsSafe`.
- Quotes are computed at `contextSlot` and expire within seconds. Never cache them.

## Quote → signed transaction (TypeScript)

```typescript
import {
  AddressLookupTableAccount, ComputeBudgetProgram, Connection, Keypair, PublicKey,
  TransactionInstruction, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';

const API = 'https://portal.api.titan.exchange';
const headers = { 'x-api-key': process.env.TITAN_API_KEY!, Accept: 'application/json' };

export async function swap(wallet: Keypair, connection: Connection) {
  const params = new URLSearchParams({
    inputMint: 'So11111111111111111111111111111111111111112',   // SOL
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC
    amount: '1000000000',                                        // 1 SOL in lamports
    userPublicKey: wallet.publicKey.toBase58(),
    slippageBps: '50',
    numQuotes: '5',
    includeAltContents: 'true',
  });

  const res = await fetch(`${API}/api/v1/quote/swap?${params}`, { headers });
  if (!res.ok) {
    throw new Error(`[${res.status}] request=${res.headers.get('x-amzn-requestid')} ${await res.text()}`);
  }
  const quote = await res.json();
  const route = quote.quotes[quote.metadata.ExpectedWinner];
  if (!route) throw new Error('No route returned');

  const instructions = route.instructions.map((ix: any) => new TransactionInstruction({
    programId: new PublicKey(ix.p),
    keys: ix.a.map((m: any) => ({ pubkey: new PublicKey(m.p), isSigner: m.s, isWritable: m.w })),
    data: Buffer.from(ix.d, 'base64'),
  }));
  if (!instructions.some((ix: TransactionInstruction) => ix.programId.equals(ComputeBudgetProgram.programId))) {
    instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: route.computeUnitsSafe }));
  }

  // `alts` covers every returned route; keep the tables this route uses.
  const needed = new Set<string>(route.addressLookupTables);
  const lookupTables = (quote.alts ?? [])
    .filter((t: any) => needed.has(t.p))
    .map((t: any) => new AddressLookupTableAccount({
      key: new PublicKey(t.p),
      state: {
        deactivationSlot: BigInt('18446744073709551615'), // u64::MAX = active
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: t.a.map((a: string) => new PublicKey(a)),
      },
    }));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  const tx = new VersionedTransaction(message);
  tx.sign([wallet]);

  const signature = await connection.sendTransaction(tx, { maxRetries: 3 });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
  return signature;
}
```

Without `includeAltContents`, load each address in `route.addressLookupTables` with `connection.getAddressLookupTable(new PublicKey(addr))`.

In a browser app, keep the key server-side: the browser calls your backend, which adds `x-api-key` and forwards to the Portal (see `routing-errors-deployment.md` for the proxy pattern). Wallets sign on the client as usual; only the quote fetch moves server-side.

## Plans, limits and credits

| Plan | Price | Req/sec | Requests per rolling 60 s | Credits/month | API keys |
|---|---|---|---|---|---|
| Sandbox | $0 | 1 | 60 | 2,500,000 | 1 |
| Build | $25/mo | 10 | 600 | 25,000,000 | 5 |
| Scale | $100/mo | 50 | 3,000 | 125,000,000 | 5 |
| Growth | $500/mo | 150 | 9,000 | 400,000,000 | 5 |
| Enterprise | Custom | Custom | Custom | Custom | Custom — includes Titan Direct streaming, SLAs |

- **One credit per request, on every endpoint** — `/api/v1/info` costs the same as a quote, and the response status does not change the charge. Discovery calls at startup are fine; polling them is not.
- **Limits are per organization**, pooled across every key and all three regions. More keys or more regions do not raise the ceiling. Multiple keys are for rotation and per-service separation.
- Credits are granted per paid month from the purchase date and do not roll over. When a plan lapses, the org returns to Sandbox limits and existing keys keep working.
- Plans are paid in USDC or by card at <https://developer.titan.exchange/>.

## Errors — identify the layer first

| Status | Body | Layer | Meaning / fix |
|---|---|---|---|
| `400` | Plain text: `Failed to deserialize query string: missing field \`userPublicKey\`` | Engine | Missing or malformed param; the message names the field |
| `400` | `{"code":7,"message":"... out of bounds ..."}` | Engine | Valid but outside `/api/v1/info` bounds |
| `401` | `{"error":{"code":"invalid_api_key"}}` | Platform | Bad/revoked key, or JWT/wrong host |
| `403` | `{"message":"Missing Authentication Token"}` | Edge | **Unknown method or path, not auth.** Usually a `POST` (`curl -d` sends POST) or a typo in the path |
| `404` | `{"code":-7,"metadata":{"errors":{"Titan":"...","Titan-DART":"NoRoutesFound"}}}` | Engine | No route. Relax `dexes` / `excludeDexes` / `venueAllowlist` / `onlyDirectRoutes` / `providers`, or raise the amount. **`404` without `metadata.errors`** = request rejected before routing, most often a `userPublicKey` that is not a usable wallet |
| `429` | `{"error":{"code":"rate_limited"}}` | Platform | Over `rps × 60` in the last 60 s. Honor `retry-after` |
| `429` | `{"error":{"code":"allowance_exhausted"}}` | Platform | Month's credits spent. **Retrying will never fix it** — upgrade or wait for the period to roll over |

Handle the two `429`s differently:

```typescript
async function getQuote(params: URLSearchParams, attempt = 0): Promise<any> {
  const res = await fetch(`${API}/api/v1/quote/swap?${params}`, { headers });
  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    if (body?.error?.code === 'allowance_exhausted') {
      throw new Error('Titan credit allowance exhausted — upgrade the plan or wait for the next period');
    }
    if (attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((r) => setTimeout(r, wait * 1000));
      return getQuote(params, attempt + 1);
    }
  }
  if (!res.ok) {
    throw new Error(`[${res.status}] request=${res.headers.get('x-amzn-requestid')} ${await res.text()}`);
  }
  return res.json();
}
```

Rate-limit headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`) appear **only on `429`s** — successful responses carry none, so remaining budget cannot be tracked from them. Throttle client-side to the plan's rps instead.

For support, include the `x-amzn-requestid` header and the quote `id` (or `quoteId.tag` on a `404`).

## Gotchas checklist

| Symptom | Cause |
|---|---|
| Response is binary / `res.json()` throws | Missing `Accept: application/json` (default is MessagePack) |
| Only one provider in `quotes` | `numQuotes` defaults to `1` |
| `quotes[0]` is `undefined` | `quotes` is a map keyed by provider ID |
| `401 invalid_api_key` with a working-looking token | It's a distributor JWT, or the key is sent as `Authorization` instead of `x-api-key`, or wrong host |
| `403 Missing Authentication Token` | Wrong method/path; every endpoint is `GET` |
| `404 -7` with a valid-looking venue filter | Unknown `dexes` label — fetch labels from `/api/v1/venues` |
| Transaction fails "wrong signer" | Signed with a different wallet than `userPublicKey` |
| Instruction data garbled | `d` is base64 in JSON — `Buffer.from(ix.d, 'base64')`, not a byte array |
| Throughput capped despite many keys | Limits are per org, not per key |

Docs: <https://titan-exchange.gitbook.io/titan/developer-doc/developers-portal>
