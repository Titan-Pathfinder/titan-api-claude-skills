# Titan Swap API - Claude Skill

[![npm](https://img.shields.io/npm/v/@titanexchange/titan-api-skill)](https://www.npmjs.com/package/@titanexchange/titan-api-skill)

## Installation

### npx (recommended)

Install with a single command:

**For current project:**

```bash
npx @titanexchange/titan-api-skill
```

**For all projects (global):**

```bash
npx @titanexchange/titan-api-skill --global
```

**Overwrite existing install:**

```bash
npx @titanexchange/titan-api-skill --force
```

Then type `/titan-swap-api` in Claude Code to use the skill.

### Manual install (curl)

If you prefer not to use npx:

**Global:**

```bash
mkdir -p ~/.claude/skills/titan-swap-api
curl -o ~/.claude/skills/titan-swap-api/SKILL.md https://raw.githubusercontent.com/Titan-Pathfinder/titan-api-claude-skills/main/SKILL.md
```

**Project-level:**

```bash
mkdir -p .claude/skills/titan-swap-api
curl -o .claude/skills/titan-swap-api/SKILL.md https://raw.githubusercontent.com/Titan-Pathfinder/titan-api-claude-skills/main/SKILL.md
```

## What This Skill Provides

- **Protocol-aware code generation** — Generates TypeScript with correct MessagePack encoding, BigInt amounts, and bs58-decoded token mints matching the Titan WebSocket API spec.
- **SDK and raw WebSocket support** — Covers both SDK-based and direct WebSocket integration depending on developer needs.
- **Parameter structure enforcement** — Places fields like `slippageBps`, `intervalMs`, and `num_quotes` in their correct nested objects matching the expected request schema.
- **Runnable examples included** — Ships with working TypeScript examples that can be executed directly after setting up environment config.

## Quick Example

Ask Claude Code:

> "Help me stream USDC to SOL quotes using Titan API"

Claude will guide you through:
```typescript
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

const client = await V1Client.connect(`${WS_URL}?auth=${AUTH_TOKEN}`);

const { stream } = await client.newSwapQuoteStream({
  swap: {
    inputMint: bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    outputMint: bs58.decode("So11111111111111111111111111111111111111112"),
    amount: BigInt(100_000_000), // 100 USDC - must be BigInt!
  },
  transaction: {
    userPublicKey: bs58.decode(USER_PUBLIC_KEY),
  },
});

for await (const quotes of stream) {
  console.log(quotes);
}
```

## Runnable Examples

The `/examples` directory contains working TypeScript examples:

```bash
cd examples
npm install
cp .env.example .env
# Edit .env with your credentials

npm run stream-sdk   # SDK streaming
npm run stream-raw   # Raw WebSocket
npm run proxy        # Backend proxy
```

## Key Things to Know

| Topic | Details |
|-------|---------|
| Protocol | WebSocket + MessagePack (not JSON) |
| Amount | Must be `BigInt`, not `number` |
| Token mints | Must be `Uint8Array` via `bs58.decode()` |
| Parameters | `slippageBps` in `swap`, `intervalMs` in `update` |

## Required Credentials

| Variable | Description |
|----------|-------------|
| `WS_URL` | Titan WebSocket endpoint |
| `AUTH_TOKEN` | API authentication token |

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Titan TypeScript SDK](https://github.com/Titan-Pathfinder/titan-sdk-ts)
- [Titan API Documentation](https://titan-exchange.gitbook.io/titan/titan-developer-docs)

## License

MIT
