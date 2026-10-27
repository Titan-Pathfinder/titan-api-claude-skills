import { describe, expect, it, vi } from 'vitest';
import { createDocsSource, normalizeDocUrl, parseIndex, searchPages, splitFull, joinPages } from '../src/docs.js';
import { handle } from '../src/index.js';

const INDEX = `# Titan

## Developer Docs

- [Errors](https://titan-exchange.gitbook.io/titan/developer-doc/developers-portal/errors.md): HTTP response codes and error bodies.
- [Quickstart](https://titan-exchange.gitbook.io/titan/developer-doc/developers-portal/quickstart.md): Fetch a quote.
`;

const FULL = `# Errors

A 429 with allowance_exhausted means the monthly credits are spent.

# Quickstart

\`\`\`bash
# not a page break
curl https://portal.api.titan.exchange/api/v1/info
\`\`\`
`;

function fakeDocs() {
  const fetchText = vi.fn(async (url: string) => {
    if (url.endsWith('/llms.txt')) return INDEX;
    if (url.endsWith('/llms-full.txt')) return FULL;
    if (url.endsWith('/errors.md')) return '# Errors\n\npage body';
    throw new Error('404');
  });
  return { source: createDocsSource(fetchText), fetchText };
}

let nextId = 1;
async function rpc(method: string, params: unknown, source = fakeDocs().source) {
  const res = await handle(
    new Request('https://mcp.example/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }),
    source,
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { result: any }).result;
}

describe('docs parsing', () => {
  it('splits pages on top-level headings outside code fences and pairs them with the index', () => {
    const pages = joinPages(parseIndex(INDEX), splitFull(FULL));
    expect(pages.map((p) => p.title)).toEqual(['Errors', 'Quickstart']);
    expect(pages[1].body).toContain('# not a page break');
  });

  it('drops full text instead of attaching the wrong page when titles drift', () => {
    const pages = joinPages(parseIndex(INDEX), [{ title: 'Something else', body: 'x' }]);
    expect(pages.every((p) => p.body === '')).toBe(true);
  });

  it('ranks pages by matches and returns a snippet around the hit', () => {
    const hits = searchPages(joinPages(parseIndex(INDEX), splitFull(FULL)), 'allowance_exhausted', 5);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('Errors');
    expect(hits[0].snippet).toContain('allowance_exhausted');
  });

  it('ranks the page with the rare word above pages that repeat a common one', () => {
    const page = (title: string, body: string) => ({ title, url: `u/${title}`, description: '', body });
    const pages = [
      page('Orders', 'retry retry retry retry retry'),
      page('Limits', 'retry retry retry'),
      page('Errors', 'allowance_exhausted: do not retry'),
    ];
    expect(searchPages(pages, 'allowance_exhausted retry', 3)[0].title).toBe('Errors');
  });

  it('only reads Titan GitBook pages, as markdown', () => {
    expect(normalizeDocUrl('developer-doc/developers-portal/errors')).toBe(
      'https://titan-exchange.gitbook.io/titan/developer-doc/developers-portal/errors.md',
    );
    expect(normalizeDocUrl('https://titan-exchange.gitbook.io/titan/x.md#h')).toBe('https://titan-exchange.gitbook.io/titan/x.md');
    expect(normalizeDocUrl('https://evil.example/titan/x')).toBeNull();
    expect(normalizeDocUrl('https://titan-exchange.gitbook.io/other/x')).toBeNull();
    expect(normalizeDocUrl('../other/x')).toBeNull();
  });

  it('caches the docs and retries after a failed load', async () => {
    let fail = true;
    const fetchText = vi.fn(async (url: string) => {
      if (fail) throw new Error('down');
      return url.endsWith('/llms.txt') ? INDEX : FULL;
    });
    const source = createDocsSource(fetchText);
    await expect(source.pages()).rejects.toThrow('down');
    fail = false;
    expect(await source.pages()).toHaveLength(2);
    await source.pages();
    expect(fetchText).toHaveBeenCalledTimes(4);
  });
});

describe('MCP over HTTP', () => {
  it('initializes with instructions that point new integrations at the Portal', async () => {
    const result = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(result.serverInfo.name).toBe('titan-docs');
    expect(result.instructions).toContain('Developers Portal');
  });

  it('lists the three tools and the integration prompt', async () => {
    const { tools } = await rpc('tools/list', {});
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual(['get_doc', 'get_integration_guide', 'search_docs']);
    const { prompts } = await rpc('prompts/list', {});
    expect(prompts.map((p: { name: string }) => p.name)).toEqual(['titan_integrate']);
  });

  it('serves the Portal guide from the bundled skill', async () => {
    const result = await rpc('tools/call', { name: 'get_integration_guide', arguments: { surface: 'portal' } });
    expect(result.content[0].text).toContain('portal.api.titan.exchange');
  });

  it('rewrites reference-file pointers in the overview to tool calls', async () => {
    const result = await rpc('tools/call', { name: 'get_integration_guide', arguments: { surface: 'overview' } });
    const overview: string = result.content[0].text;
    expect(overview).toContain('get_integration_guide("portal")');
    expect(overview).not.toMatch(/`references\/\w/);
    expect(overview.startsWith('---')).toBe(false);
  });

  it('searches and reads live docs', async () => {
    const search = await rpc('tools/call', { name: 'search_docs', arguments: { query: 'allowance_exhausted' } });
    expect(search.content[0].text).toContain('developers-portal/errors.md');
    const page = await rpc('tools/call', { name: 'get_doc', arguments: { url: 'developer-doc/developers-portal/errors' } });
    expect(page.content[0].text).toContain('page body');
  });

  it('refuses to fetch outside the Titan docs', async () => {
    const { source, fetchText } = fakeDocs();
    const result = await rpc('tools/call', { name: 'get_doc', arguments: { url: 'https://evil.example/x' } }, source);
    expect(result.isError).toBe(true);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('returns the interview workflow as the titan_integrate prompt', async () => {
    const result = await rpc('prompts/get', { name: 'titan_integrate', arguments: { goal: 'a Telegram trading bot' } });
    const prompt: string = result.messages[0].content.text;
    expect(prompt).toContain('a Telegram trading bot');
    expect(prompt).toContain('Developers Portal');
  });

  it('describes the server to a browser visiting /mcp', async () => {
    const res = await handle(new Request('https://mcp.example/mcp', { headers: { accept: 'text/html' } }), fakeDocs().source);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.server.name).toBe('titan-docs');
    expect(body.connect).toBe('claude mcp add --transport http titan-docs https://mcp.example/mcp');
    expect(body.tools.map((t: { name: string }) => t.name)).toContain('search_docs');
    expect(body.prompts[0].name).toBe('titan_integrate');
  });

  it('answers 404 off the MCP path', async () => {
    expect((await handle(new Request('https://mcp.example/nope'))).status).toBe(404);
  });
});
