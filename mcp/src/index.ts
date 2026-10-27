import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createDocsSource, type DocsSource } from './docs.js';
import { createServer } from './server.js';

// Cloudflare's edge cache holds GitBook responses for 15 minutes.
const docs = createDocsSource(async (url) => {
  const res = await fetch(url, { cf: { cacheTtl: 900, cacheEverything: true } });
  if (!res.ok) throw new Error(`GitBook returned ${res.status}`);
  return res.text();
});

// Stateless Streamable HTTP: each request gets a fresh server and transport,
// so any isolate can answer any request and nothing is kept between calls.
export async function handle(request: Request, source: DocsSource = docs): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/') {
    return new Response('Titan docs MCP server. Connect your MCP client to /mcp.\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  if (pathname !== '/mcp') return new Response('Not found\n', { status: 404 });
  // A browser or curl visiting the URL gets a readable description of the
  // server. MCP clients always send POST or accept text/event-stream.
  if (request.method === 'GET' && !(request.headers.get('accept') ?? '').includes('text/event-stream')) {
    return describe(request.url, source);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createServer(source).connect(transport);
  return transport.handleRequest(request);
}

// Built from the server's own initialize, tools/list and prompts/list answers,
// so the description always matches what MCP clients see.
async function describe(url: string, source: DocsSource): Promise<Response> {
  const call = async (method: string, params: object) => {
    const res = await handle(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
      source,
    );
    return ((await res.json()) as { result: any }).result;
  };
  const init = await call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'browser', version: '0' },
  });
  const [{ tools }, { prompts }] = await Promise.all([call('tools/list', {}), call('prompts/list', {})]);
  const body = {
    server: { ...init.serverInfo, transport: 'http' },
    connect: `claude mcp add --transport http titan-docs ${url}`,
    instructions: init.instructions,
    capabilities: init.capabilities,
    tools,
    prompts,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default { fetch: (request: Request) => handle(request) };
