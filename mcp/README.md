# Titan docs MCP server

A remote MCP server that gives any AI coding tool the Titan integration skill and the live Titan docs. It runs as a stateless Cloudflare Worker over Streamable HTTP at `/mcp`.

| Name | Kind | What it does |
|---|---|---|
| `titan_integrate` | prompt | The skill's interview workflow: asks about the project, then writes the integration |
| `get_integration_guide` | tool | One full guide: `overview`, `portal`, `gateway`, `direct`, `dart`, `wire-protocol`, `errors-deployment` |
| `search_docs` | tool | Full-text search over the live GitBook docs |
| `get_doc` | tool | One docs page as markdown, restricted to `titan-exchange.gitbook.io/titan/` |

The guides are bundled from `../skills/titan-swap-api` at build time, so the MCP and the Claude Code plugin always serve the same content. The docs are read from GitBook's `llms.txt` and `llms-full.txt` and cached for 15 minutes.

## Develop

```bash
npm install
npm test          # bundles the skill, then runs vitest
npm run dev       # local Worker on http://localhost:8787/mcp
```

## Connect

```bash
claude mcp add --transport http titan-docs https://<host>/mcp
```

Cursor, Windsurf and other clients take the same URL as a remote HTTP server.

## Deploy

```bash
npm run deploy
```

Add a route in `wrangler.toml` once the hostname is chosen.
