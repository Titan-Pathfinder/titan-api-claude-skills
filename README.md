# Titan Swap API - Claude Skill


## Installation

Add the skill to Claude Code:

    claude mcp add titan-api-claude-skills -- npx github:Titan-Pathfinder/titan-api-claude-skills

Alternatively, manually copy `SKILL.md` into your project.
## What This Skill Provides

When you have this skill installed, Claude Code can help you:

- Stream real-time swap quotes from Titan API
- Integrate using the SDK (`@titanexchange/sdk-ts`) or raw WebSocket
- Handle MessagePack protocol encoding
- Build secure browser integrations with backend proxies
- Understand token amounts, BigInt requirements, and parameter structure

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
| `USER_PUBLIC_KEY` | Solana wallet address (base58) |

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Titan TypeScript SDK](https://github.com/Titan-Pathfinder/titan-sdk-ts)
- [Titan API Documentation](https://titan-exchange.gitbook.io/titan/titan-developer-docs)

## License

MIT
