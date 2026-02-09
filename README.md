# Titan API Claude Skills

A Claude skill repository for integrating with the Titan Swap API - a WebSocket-based DEX aggregator for Solana.

## What's Included

### Claude Skill (`SKILL.md`)

Knowledge base that helps developers integrate Titan API. Covers:

- **Streaming quotes** - Real-time swap quote streaming
- **SDK integration** - Using `@titanexchange/sdk-ts`
- **Raw WebSocket** - Direct integration without SDK
- **Swap execution** - Full transaction flow
- **Browser security** - Backend proxy pattern
- **Error handling** - Connection management and retries

### Examples (`/examples`)

Runnable TypeScript examples demonstrating each integration pattern.

| Example | Description |
|---------|-------------|
| `stream-quotes-sdk.ts` | Stream swap quotes using the Titan SDK |
| `stream-quotes-raw-ws.ts` | Stream quotes using raw WebSocket (no SDK) |
| `backend-proxy.ts` | Secure WebSocket proxy for browser clients |

## Quick Start

### 1. Setup Examples

```bash
cd examples
npm install
cp .env.example .env
# Edit .env with your credentials
```

### 2. Run Examples

```bash
# Stream quotes (SDK)
npm run stream-sdk

# Stream quotes (raw WebSocket)
npm run stream-raw

# Start proxy server
npm run proxy
```

## Required Credentials

| Variable | Description |
|----------|-------------|
| `WS_URL` | Titan WebSocket endpoint |
| `AUTH_TOKEN` | Your API authentication token |
| `USER_PUBLIC_KEY` | Your Solana wallet address |

## Using the Claude Skill

The `SKILL.md` file can be used as a Claude skill to help developers understand and implement Titan API integrations.

To use as a skill:
1. Package `SKILL.md` into a `.skill` file
2. Register with Claude Code or your Claude integration

## Resources

- [Titan TypeScript SDK](https://github.com/Titan-Pathfinder/titan-sdk-ts)
- [Titan Rust SDK](https://github.com/Titan-Pathfinder/titan-sdk-rs)
- [API Documentation](https://titan-exchange.gitbook.io/titan/titan-developer-docs)


