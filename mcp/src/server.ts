import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DOCS_BASE, normalizeDocUrl, searchPages, type DocsSource } from './docs.js';
import { GUIDES, SKILL } from './skill-content.generated.js';

// Surface names a developer would say, mapped to the skill's reference files.
const SURFACES = {
  overview: { file: null, about: 'Choosing a surface, the integration interview, key principles, common issues' },
  portal: { file: 'portal', about: 'Developers Portal: portal.api.titan.exchange, x-api-key, JSON quotes, plans, credits, 429 handling' },
  gateway: { file: 'gateway', about: 'Titan Gateway REST with a distributor JWT: quotes, prices, discovery, Swap V3' },
  direct: { file: 'direct', about: 'Titan Direct WebSocket streaming: SDK and raw client, quote streams, Swap V3' },
  dart: { file: 'dart', about: 'DART public API: on-chain re-optimizing router' },
  'wire-protocol': { file: 'wire-protocol', about: 'MessagePack wire format, type layouts, compression' },
  'errors-deployment': { file: 'routing-errors-deployment', about: 'Routing options, error codes, backend proxy and deployment patterns' },
} as const;
type Surface = keyof typeof SURFACES;

const SURFACE_LIST = (Object.keys(SURFACES) as Surface[]).map((s) => `- ${s}: ${SURFACES[s].about}`).join('\n');

// In the plugin, SKILL.md points at references/*.md files. Over MCP the same
// content comes from get_integration_guide.
const SKILL_FOR_MCP = SKILL.replace(/^---\n[\s\S]*?\n---\n/, '').replace(
  /`references\/([a-z-]+)\.md`/g,
  (_, file: string) => {
    const surface = (Object.keys(SURFACES) as Surface[]).find((s) => SURFACES[s].file === file);
    return surface ? `get_integration_guide("${surface}")` : `\`references/${file}.md\``;
  },
);

export const INSTRUCTIONS = `Titan is a Solana DEX meta-aggregator. Use these tools to write working Titan integrations.
New integrations should default to the Developers Portal (self-serve key, plain JSON).
Start with the titan_integrate prompt or get_integration_guide("overview"), then load the guide for the chosen surface.
Use search_docs and get_doc for anything the guides don't cover; they read the live docs at ${DOCS_BASE}.`;

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

export function createServer(docs: DocsSource): McpServer {
  const server = new McpServer({ name: 'titan-docs', version: '1.2.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'get_integration_guide',
    {
      title: 'Get Titan integration guide',
      description: `Returns a complete, code-level integration guide for one Titan API surface. Surfaces:\n${SURFACE_LIST}`,
      inputSchema: { surface: z.enum(Object.keys(SURFACES) as [Surface, ...Surface[]]) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ surface }) => {
      const file = SURFACES[surface].file;
      return text(file === null ? SKILL_FOR_MCP : GUIDES[file]);
    },
  );

  server.registerTool(
    'search_docs',
    {
      title: 'Search Titan docs',
      description: 'Full-text search over the live Titan documentation. Returns page titles, URLs and a snippet; read a page with get_doc.',
      inputSchema: {
        query: z.string().min(2).describe('Words to look for, e.g. "allowance_exhausted" or "swap v3 payer"'),
        limit: z.number().int().min(1).max(10).default(5),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, limit }) => {
      const hits = searchPages(await docs.pages(), query, limit);
      if (hits.length === 0) return text(`No Titan docs pages match "${query}".`);
      return text(
        hits
          .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.description ? `\n   ${h.description}` : ''}\n   …${h.snippet}…`)
          .join('\n\n'),
      );
    },
  );

  server.registerTool(
    'get_doc',
    {
      title: 'Read a Titan docs page',
      description: 'Returns one Titan docs page as markdown. Accepts a URL from search_docs or a path such as "developer-doc/developers-portal/errors".',
      inputSchema: { url: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      const target = normalizeDocUrl(url);
      if (!target) {
        return { ...text('Only pages under https://titan-exchange.gitbook.io/titan/ can be read.'), isError: true };
      }
      try {
        return text(await docs.fetchText(target));
      } catch (error) {
        return { ...text(`Could not read ${target}: ${(error as Error).message}`), isError: true };
      }
    },
  );

  server.registerPrompt(
    'titan_integrate',
    {
      title: 'Integrate Titan swaps',
      description: 'Interviews you about your project, then writes a working Titan integration.',
      argsSchema: { goal: z.string().optional().describe('What you are building, if you already know') },
    },
    ({ goal }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Help me integrate Titan swaps into my project.${goal ? ` What I'm building: ${goal}` : ''}\n\n` +
              `Follow this workflow. Ask the interview questions one step at a time, read my project before writing code, ` +
              `and load reference material with the titan-docs tools as it says.\n\n${SKILL_FOR_MCP}`,
          },
        },
      ],
    }),
  );

  return server;
}
