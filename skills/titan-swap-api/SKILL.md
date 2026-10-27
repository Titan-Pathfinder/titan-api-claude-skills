---
name: titan-swap-api
description: Titan Swap API and Solana DEX-aggregation integration guide. Use whenever the user mentions Titan, Argos, or DART, the Titan Developers Portal (`portal.api.titan.exchange`, `x-api-key`, plans/credits, `rate_limited` / `allowance_exhausted`), or asks about streaming swap quotes, REST swap quotes, MessagePack-encoded Solana swap APIs, route selection (`metadata.ExpectedWinner`), Swap V3 (`payer`, `positiveSlippageFeeReceiver`), or building Solana swap/aggregator functionality — even if they don't explicitly say "Titan." Also use for DART-specific routing (1 bps fee, BBO guarantee, on-chain re-optimization at execution time).
version: 1.2.0
author: Titan Exchange
tags: [solana, dex, swap, websocket, rest, streaming, defi, dart, argos, messagepack]
sdk: "@titanexchange/sdk-ts"
protocol: WebSocket + REST (MessagePack)
chain: Solana
---

## Agent Behavior

When this skill is invoked, hold off on code generation and run the short interview below first (`AskUserQuestion` if available, otherwise inline questions). The reason: Titan has three distinct surfaces (Direct WebSocket, Gateway REST, DART JSON) that require different SDKs, encodings, and even different field shapes. Generating code before knowing which surface the user wants almost always produces something they have to throw away. The interview takes 30 seconds and saves a rewrite.

**Step 1 — Credentials check:**

Ask the user:
> **Titan Swap API** skill loaded.
>
> Which credentials do you have?
> - A **Developers Portal API key** from <https://developer.titan.exchange/> (sent as `x-api-key`)
> - A **distributor / Enterprise endpoint + JWT** (Triton, QuickNode, or issued by the Titan team)
> - **None yet**

If they have none, point them to the Portal: anyone can sign in at <https://developer.titan.exchange/> and create a key on the free Sandbox plan (1 req/sec) in a minute. That is the default path for new integrations. Continue with the questions below so the setup is ready once they have a key.

The two credential types are **not interchangeable**: a Portal key only works against `portal.api.titan.exchange` with `x-api-key`, and a JWT only works against the distributor endpoint with `Authorization: Bearer`. Sending one to the other's host returns `401`. Match Step 2 to the credential they have.

Note on wallet pubkeys — don't ask the user for theirs as if it were a credential. The wallet pubkey is a runtime value the app already has access to in three standard ways:
- Wallet adapters (`@solana/wallet-adapter-react`, Phantom, Solflare, etc.) in frontend apps
- Keypair files or env vars in backend services/bots
- A `Keypair` loaded from a private key in scripts/CLIs

When generating code, detect how the user's project handles wallets and use that pattern. Asking for the pubkey directly is a sign you haven't read their wallet setup yet — start there.

**Step 2 — Ask which API they want:**

Use the AskUserQuestion tool with these options:

Question: "Which Titan API do you want to use?"
- **Developers Portal (REST, self-serve key) — recommended** — `portal.api.titan.exchange` with an `x-api-key` from developer.titan.exchange. Plain JSON responses (`Accept: application/json`), plans from a free Sandbox up to 150 req/sec. Best for most new integrations: wallets, dApps, bots and backends that don't need streaming.
- **Titan Direct (WebSocket)** — Persistent WebSocket connection with real-time streaming quotes. Best for trading bots, market makers, and latency-sensitive apps. Uses `@titanexchange/sdk-ts` or raw WebSocket with MessagePack.
- **Titan Gateway (REST)** — Standard REST endpoints returning a single set of quotes per request. Best for wallets, dApps, backend services, and existing REST architectures. No WebSocket infrastructure needed.
- **DART Public API (REST, no key)** — Free public JSON REST endpoint that quotes exclusively via Titan's DART on-chain routing engine. Best for low-volume integrations, testing, or DART-only flows on supported pairs. **The free public tier is rate-limited to 1 request per second per IP — sufficient for prototyping and light usage. For higher throughput on a DART-only integration, the user needs a partner DART API key from the Titan team.** No API key needed for the free tier.

Explain: the Portal, Direct and Gateway all route through Argos and deliver the same quote quality — the Portal *is* Titan Gateway behind a self-serve key. Direct (streaming) is an Enterprise feature delivered through distributors; the Portal has no WebSocket. DART is a separate dedicated endpoint that uses only the DART provider — pick it when you specifically want DART's on-chain BBO guarantee, or for free testing without credentials.

**If the user picks DART**, surface this up front so they aren't surprised later:
> The free public DART endpoint allows **1 request per second per IP**. If you need more throughput on a DART-only path, please reach out to the Titan team for a partner DART API key — apply at <https://tally.so/r/1AvYeL> or contact the team directly. (Reminder: Gateway and Direct already include DART as one of their providers, and `metadata.ExpectedWinner` will pick `Titan-DART` automatically when it's the best route — so a higher-tier general API key is often a simpler path than a DART-only key.)

**Step 3 — Ask how they want to integrate:**

Use the AskUserQuestion tool with these options:

If they chose **Titan Direct**:
- **SDK (recommended)** — Uses `@titanexchange/sdk-ts`. Handles WebSocket connection, MessagePack encoding, and stream management for you. Best for TypeScript/Node.js projects.
- **Raw WebSocket** — Direct WebSocket connection with manual MessagePack encoding. Use when you need full control or your language doesn't have an SDK.
- **Backend proxy** — Proxy Titan's WebSocket through your own backend. Required for browser apps to keep API keys secure.
- **Into existing project** — Replace or add Titan as a swap source in a project that already has swap/trading logic.

If they chose **Developers Portal**:
- **Quick integration** — Plain `fetch` with `x-api-key` and `Accept: application/json`. No SDK, no MessagePack.
- **Backend proxy** — For browser or mobile apps: the key stays on your server, which forwards quote requests.
- **Into existing project** — Replace or add Titan as a swap source in a project that already has swap/trading logic.

If they chose **Titan Gateway**:
- **Quick integration** — Simple fetch calls with MessagePack decoding. Minimal setup.
- **Into existing project** — Replace or add Titan Gateway as a swap source in a project that already has swap/trading logic.

If they chose **DART Public API**:
- **Quick integration** — Plain JSON `fetch` calls. No SDK, no MessagePack. Minimal setup.
- **Into existing project** — Replace or add DART as a swap source in a project that already has swap/trading logic.

**Step 4 — Ask what they need from the API:**

Use the AskUserQuestion tool with these options:

For **Titan Direct**:
- **Stream quotes only** — Just receive live swap quotes to display prices or compare routes. No transaction execution.
- **Stream + execute swaps** — Full flow: receive quotes, pick the best, sign the transaction, send it, and confirm on-chain.
- **Multiple pairs at once** — Monitor several token pairs simultaneously with concurrent streams.

For **Developers Portal**:
- **Get swap quotes + execute** — `GET /api/v1/quote/swap`, pick `metadata.ExpectedWinner`, build and send the transaction.
- **Quotes only** — Display prices and routes without executing.
- **Handle plan limits** — Rate limiting and credit exhaustion (`rate_limited` vs `allowance_exhausted`) for a production service.

For **Titan Gateway**:
- **Get swap quotes** — Fetch executable swap quotes with transaction instructions. Full swap flow.
- **Price check only** — Lightweight price quotes without transaction data. For displaying prices.
- **Both** — Use price endpoint for display, swap endpoint for execution.

For **DART Public API**:
- **Get swap quotes** — `POST /swap` returns transaction-ready instructions (compute budget pre-prepended).
- **Discover supported pairs** — `GET /markets`. Use this if the user's pair isn't in the canned list.
- **Health check / monitoring** — `GET /health`. Use for uptime probes from a backend.

**Step 5 — If they chose "Into existing project":**

Before writing any code:
1. Ask them to point to the files where their current swap logic lives
2. Read and understand their codebase — look for how they currently fetch quotes, build transactions, sign, and send
3. Identify their current provider (Jupiter, Orca, Raydium, etc.)
4. Propose a plan showing exactly which files change and how Titan fits in
5. Wait for their approval before writing code

**Step 6 — Generate code:**

Now generate code, tailored to what the user told you in steps 1–5. Match their:
- Project structure and file organization
- Naming conventions (camelCase, snake_case, etc.)
- Patterns (classes vs functions, async/await vs callbacks)
- Existing error handling style
- Package manager (npm, yarn, pnpm)

The goal isn't to drop in a generic example — it's to produce code that fits the user's codebase well enough to keep. If you find yourself writing boilerplate that ignores their conventions, stop and re-read their files.

---

# Titan Swap API Knowledge Base

Titan is a meta-aggregator for Solana that collects swap quotes from multiple providers and routes through **Argos**, Titan's proprietary routing engine. It is reachable three ways with identical routing quality: the self-serve **Developers Portal** (REST, `x-api-key`), **Titan Gateway** (REST, distributor JWT) and **Titan Direct** (WebSocket streaming, Enterprise/distributors).

## Key Concepts

- **Meta-aggregation:** Titan routes across aggregators AND direct venues, not just individual liquidity sources
- **Providers:** Sources of quotes (DEX aggregators like Metis/Okx or RFQ providers)
- **Venues:** Individual on-chain pools (Raydium, Phoenix, Orca, Whirlpool, Meteora, PumpFun)
- **Argos:** Titan's proprietary routing algorithm — resolves price impacts with machine-level precision
- **DART:** Titan's on-chain routing engine that re-optimizes routes at execution time (BBO guarantee, up to 1 bps fee)
- **Titan Direct:** WebSocket API for streaming live quotes updated continuously
- **Titan Gateway:** REST API for single-request quotes — same Argos routing, simpler integration
- **Developers Portal:** self-serve access to Titan Gateway at `portal.api.titan.exchange` with an `x-api-key`, JSON responses, and per-organization plans (rate limit + monthly credits)

## Reference files

The bulk of this skill lives in six reference files under `references/`. SKILL.md keeps just the agent interview, cross-API concepts that apply to all three surfaces, and short pointer blocks. Load only what you need for the task at hand.

| If the user is working on… | Read |
|---|---|
| Developers Portal — `portal.api.titan.exchange`, `x-api-key`, JSON quotes, plans, credits, `429` handling | `references/portal.md` |
| Titan Gateway (REST) — quotes, prices, discovery endpoints, Swap V3 with REST | `references/gateway.md` |
| Titan Direct (WebSocket) — SDK, raw WebSocket, multi-stream, Swap V3 with Direct | `references/direct.md` |
| DART Public API — free JSON endpoint, supported pairs, partner keys | `references/dart.md` |
| Routing constraints, fee collection, error handling, reconnection, browser proxy patterns | `references/routing-errors-deployment.md` |
| MessagePack details, compact `{p,a,d}` instruction format, non-TS language ports | `references/wire-protocol.md` |

**Rule of thumb:** load a reference before generating any non-trivial code for that surface. The recap blocks below each `# H1` are deliberately short — they cover gotchas a developer needs to *avoid* mistakes, not enough to *write* a full integration.

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

**Developers Portal (self-serve):**
- `TITAN_API_KEY` — created at <https://developer.titan.exchange/>, sent as `x-api-key: <key>`
- Endpoint is fixed: `https://portal.api.titan.exchange` (nearest of three regions, automatically)

**Distributor / Enterprise (Gateway and Direct)** — users need from the Titan team or their distributor:
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

# Titan Developers Portal — self-serve REST

> **Full reference:** `references/portal.md`. Load it when the user picked the Portal in Step 2, has a key from developer.titan.exchange, or asks about `portal.api.titan.exchange`, `x-api-key`, plans, credits, or `rate_limited` / `allowance_exhausted`.

Quick recap:

- Base URL `https://portal.api.titan.exchange`; four `GET` endpoints: `/api/v1/quote/swap`, `/api/v1/info`, `/api/v1/venues`, `/api/v1/providers`
- Headers on every call: `x-api-key: ${TITAN_API_KEY}` and `Accept: application/json` (default is MessagePack)
- Flat query params, comma-separated lists; set `numQuotes=5` or you only see one provider
- `quotes` is a map keyed by provider ID; execute `quotes[metadata.ExpectedWinner]`; instruction `d` is **base64** in JSON
- Limits are per organization across all keys and regions; every request costs one credit, `/info` included
- `429 rate_limited` → honor `retry-after`; `429 allowance_exhausted` → stop retrying, upgrade or wait for the period
- `403 Missing Authentication Token` means wrong method/path (all endpoints are `GET`), not bad auth

# Titan Gateway — REST API

> **Full reference:** `references/gateway.md`. Load it when the user picked Gateway in Step 2 or asks anything about the REST endpoints (`/api/v1/quote/swap`, `/api/v1/quote/price`, `/api/v1/info`, `/api/v1/venues`, `/api/v1/providers`), MessagePack-encoded REST responses, or Swap V3 with Gateway.

Quick recap so you don't have to load the reference for trivial questions:

- Base path: `${TITAN_ENDPOINT}/api/v1/...`
- Auth: `Authorization: Bearer ${TITAN_API_KEY}` (or `?auth=` query param)
- Always set `Accept: application/vnd.msgpack` and decode with `Decoder({ useBigInt64: true })`
- Pubkey query params are **base58 strings**; instruction `data` returned in MessagePack as raw bytes
- Pick routes via `metadata.ExpectedWinner`, not by sorting `outAmount`
- Swap V3 fields (`titanSwapVersion`, `payer`, `positiveSlippageFeeReceiver`) — see reference

# Titan Direct — WebSocket API

> **Full reference:** `references/direct.md`. Load it when the user picked Direct in Step 2 or asks anything about WebSocket streaming, `@titanexchange/sdk-ts`, `NewSwapQuoteStream`, multi-stream management, raw-WebSocket integration, reconnection, compression, or Swap V3 with the Direct SDK.

Quick recap so you don't have to load the reference for trivial questions:

- Endpoint: `wss://${TITAN_ENDPOINT}/api/v1/ws?auth=${TITAN_API_KEY}`
- Two integration paths: **SDK** (`@titanexchange/sdk-ts`, recommended) or **raw WebSocket** with manual MessagePack
- Token mints and pubkeys are **`Uint8Array`** in the SDK — decode with `bs58.decode(...)`. Amounts are **BigInt**.
- `slippageBps` lives inside `swap`; `intervalMs` and `num_quotes` live inside `update` — wrong nesting silently fails
- Each `StreamData` carries `quotes` (a *map* keyed by provider, not an array) plus `metadata.ExpectedWinner`
- Swap V3 fields go inside `transaction` on `NewSwapQuoteStream` — see reference for `payer` / `positiveSlippageFeeReceiver` semantics
- Browser apps must proxy through a backend (see `references/routing-errors-deployment.md`)

# Titan DART Public API — JSON REST

> **Full reference:** `references/dart.md`. Read it before generating code for the DART endpoint.

The DART Swap API is a free public JSON REST endpoint that exclusively uses Titan's DART on-chain routing engine. Plain JSON (not MessagePack), no WebSocket, no API key required for the free tier (1 req/sec per IP).

- **Base URL:** `https://api.titan.exchange/dart`
- **Endpoints:** `GET /health`, `GET /markets`, `POST /swap`
- **Provider:** always `Titan-DART` (no `metadata.ExpectedWinner` — single-provider endpoint)
- **Higher rate limits:** partner API key via Titan team (apply at <https://tally.so/r/1AvYeL>)

For request/response shapes, the full transaction-build example, supported-pair list, and partner-key headers, load `references/dart.md`.

---

# Routing, Fees, Errors, and Browser Deployment

> **Full reference:** `references/routing-errors-deployment.md`. Load it when the user is configuring routing constraints (DEX include/exclude, direct-only routes), discovering venues/providers, collecting platform fees, debugging error responses (SDK error types, HTTP error codes, reconnection patterns), or deploying Titan in a browser frontend (which requires a backend proxy to keep API keys off the client).

Quick recap:

- Discover venues and providers with `/api/v1/venues` and `/api/v1/providers` (or SDK equivalents)
- Routing knobs: `dexes` / `excludeDexes` / `providers` / `onlyDirectRoutes`
- Platform fees: `feeAccount` (must exist on-chain) + `feeBps` + optional `feeFromInputMint`
- **Browser apps:** never put `TITAN_API_KEY` in the frontend — proxy through your backend
- Reconnection: exponential backoff, resubscribe streams after reconnect

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
| Portal response is binary | No `Accept` header | Send `Accept: application/json` |
| Portal `401 invalid_api_key` with a valid-looking token | Distributor JWT, `Authorization` instead of `x-api-key`, or wrong host | Portal keys go in `x-api-key` to `portal.api.titan.exchange` only |
| Portal `403 Missing Authentication Token` | `POST` or unknown path | Every Portal endpoint is `GET` |
| Portal `429 allowance_exhausted` | Monthly credits spent | Retrying won't help — upgrade the plan or wait for the next period |
| Portal throughput capped despite many keys | Limits are per organization | More keys don't add capacity; upgrade the plan |

---

# Key Principles

1. **Three ways in, same quality:** Developers Portal, Titan Gateway and Titan Direct all use Argos routing
2. **Amount format matters:** BigInt for Direct, string for Gateway query params
3. **Parameter placement matters:** `slippageBps` in `swap`, `intervalMs` in `update` (Direct only)
4. **Always check for empty quotes:** `quotes.quotes` can be `{}`
5. **Encoding:** Direct and distributor Gateway use MessagePack; the Portal defaults to MessagePack but returns JSON with `Accept: application/json`; DART is JSON
6. **Token mints:** Direct uses `Uint8Array` (bs58.decode), Gateway uses base58 strings
7. **Simulate before sending:** Always simulate transactions first
8. **Handle reconnection:** Direct connections will drop — implement retry logic
9. **Secure credentials:** Never expose API tokens or Portal keys in frontend code — proxy through your backend

---

# Wire Protocol Reference

> **Full reference:** `references/wire-protocol.md`. Read it when debugging MessagePack decoding, mapping the compact `{p, a, d}` instruction format, or implementing Titan in a non-TypeScript language.

Quick recap:

- Direct/Gateway responses are **MessagePack** (`application/vnd.msgpack`), not JSON. Decode with `@msgpack/msgpack` and `Decoder({ useBigInt64: true })`.
- Direct/Gateway use **compact field names** for instructions: `{p: programId, a: accounts, d: data}` and accounts are `{p: pubkey, s: isSigner, w: isWritable}`. Pubkeys are 32 raw bytes.
- DART is the exception — JSON, full field names, `data` is **base64**. See `references/dart.md`.

---

# Resources

- TypeScript SDK: https://github.com/Titan-Pathfinder/titan-sdk-ts
- Rust SDK: https://github.com/Titan-Pathfinder/titan-sdk-rs
- API Docs: https://titan-exchange.gitbook.io/titan/titan-developer-docs
- Developers Portal (keys, plans, billing): https://developer.titan.exchange/
- Portal docs: https://titan-exchange.gitbook.io/titan/developer-doc/developers-portal

## Support

Users can reach out in Telegram group for questions.
