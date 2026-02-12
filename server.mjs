#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillContent = readFileSync(join(__dirname, "SKILL.md"), "utf-8");

const server = new McpServer({
  name: "titan-swap-api",
  version: "1.0.0",
});

server.resource(
  "titan-swap-api",
  "skill://titan-swap-api",
  { description: "Titan Swap API integration guide for Claude Code" },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: skillContent,
      },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
