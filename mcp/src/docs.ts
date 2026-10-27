// Live Titan docs from GitBook: `llms.txt` is the page index (title, URL,
// description) and `llms-full.txt` is every page's markdown in the same order.
// Both are read at request time, so the MCP never goes stale when docs change.

export const DOCS_BASE = 'https://titan-exchange.gitbook.io/titan/';

export interface DocPage {
  title: string;
  url: string;
  description: string;
  body: string;
}

export interface SearchHit {
  title: string;
  url: string;
  description: string;
  snippet: string;
}

export function parseIndex(text: string): Omit<DocPage, 'body'>[] {
  return [...text.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/gm)].map((m) => ({
    title: m[1].trim(),
    url: m[2].trim(),
    description: (m[3] ?? '').trim(),
  }));
}

// Pages in llms-full.txt start with a top-level `# Title`. A `# comment` inside a
// fenced code block is not a page break.
export function splitFull(text: string): { title: string; body: string }[] {
  const pages: { title: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith('# ')) {
      pages.push({ title: line.slice(2).trim(), lines: [line] });
    } else {
      pages.at(-1)?.lines.push(line);
    }
  }
  return pages.map((p) => ({ title: p.title, body: p.lines.join('\n').trim() }));
}

// Pairs index entries with full-text sections by position. A section is only
// attached when its title matches, so a drift in GitBook's export degrades
// search to titles and descriptions instead of attaching the wrong text.
export function joinPages(index: Omit<DocPage, 'body'>[], sections: { title: string; body: string }[]): DocPage[] {
  return index.map((entry, i) => ({
    ...entry,
    body: sections[i]?.title === entry.title ? sections[i].body : '',
  }));
}

const terms = (query: string): string[] =>
  [...new Set(query.toLowerCase().split(/[^a-z0-9_/.-]+/).filter((t) => t.length >= 2))];

const count = (haystack: string, needle: string): number => {
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1 && n < 10; at = haystack.indexOf(needle, at + needle.length)) n++;
  return n;
};

export function searchPages(pages: DocPage[], query: string, limit: number): SearchHit[] {
  const words = terms(query);
  if (words.length === 0) return [];
  const docs = pages.map((page) => ({
    page,
    title: page.title.toLowerCase(),
    description: page.description.toLowerCase(),
    body: page.body.toLowerCase(),
  }));
  // Rare words decide relevance: "allowance_exhausted" outweighs "retry".
  const weight = new Map(
    words.map((w) => {
      const df = docs.filter((d) => d.title.includes(w) || d.description.includes(w) || d.body.includes(w)).length;
      return [w, Math.log(1 + docs.length / Math.max(df, 1))];
    }),
  );
  return docs
    .map(({ page, title, description, body }) => {
      let score = 0;
      let matched = 0;
      for (const w of words) {
        const hits = count(title, w) * 5 + count(description, w) * 3 + count(body, w);
        if (hits > 0) matched++;
        score += hits * weight.get(w)!;
      }
      // Pages that contain every word rank above pages that repeat one of them.
      return { page, body, score: score * (matched / words.length) ** 2 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page, body }) => {
      const at = [...words]
        .sort((a, b) => weight.get(b)! - weight.get(a)!)
        .map((w) => body.indexOf(w))
        .find((i) => i >= 0) ?? 0;
      const start = Math.max(0, at - 120);
      const snippet = page.body.slice(start, start + 320).replace(/\s+/g, ' ').trim();
      return { title: page.title, url: page.url, description: page.description, snippet };
    });
}

// Only Titan's own GitBook pages can be fetched, as markdown.
export function normalizeDocUrl(input: string): string | null {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw, DOCS_BASE);
  } catch {
    return null;
  }
  const base = new URL(DOCS_BASE);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    return null;
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('.md')) url.pathname = url.pathname.replace(/\/$/, '') + '.md';
  return url.href;
}

export type FetchText = (url: string) => Promise<string>;

const CACHE_MS = 15 * 60_000;

export function createDocsSource(fetchText: FetchText, now: () => number = Date.now) {
  let cached: { at: number; pages: Promise<DocPage[]> } | undefined;
  const load = async (): Promise<DocPage[]> => {
    const [index, full] = await Promise.all([
      fetchText(new URL('llms.txt', DOCS_BASE).href),
      fetchText(new URL('llms-full.txt', DOCS_BASE).href),
    ]);
    return joinPages(parseIndex(index), splitFull(full));
  };
  return {
    pages(): Promise<DocPage[]> {
      if (!cached || now() - cached.at > CACHE_MS) {
        const pages = load();
        cached = { at: now(), pages };
        // A failed load is not cached, so the next call retries.
        pages.catch(() => {
          if (cached?.pages === pages) cached = undefined;
        });
      }
      return cached.pages;
    },
    fetchText,
  };
}

export type DocsSource = ReturnType<typeof createDocsSource>;
