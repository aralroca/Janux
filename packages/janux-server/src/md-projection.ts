/**
 * Markdown projection of a rendered page (RFC 0002 §13.3): agents read pages
 * as clean text via the `.md` suffix or the content-MCP resources. A pragmatic
 * HTML→Markdown pass — headings, links, lists, paragraphs — over the SSR html.
 */

import { fenceUntrusted } from 'janux';

const BLOCK_DROP = /<(script|style|svg)[\s\S]*?<\/\1>/gi;

function decodeEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export function htmlToMarkdown(html: string): string {
  const markdown = html
    .replace(BLOCK_DROP, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<\/?(p|div|section|main|header|footer|article|aside|nav|blockquote|ul|ol|table|tr|td|th)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return decodeEntities(markdown);
}

/** An island on this page whose state declares `untrusted()` fields. */
export interface UntrustedIsland {
  /** The island's `data-jx` id. */
  id: string;
  /** Its resource uri, so the fence can say where the content came from. */
  uri: string;
}

const ISLAND_OPEN = '<janux-island\\b[^>]*>';
const ISLAND_TAG = `${ISLAND_OPEN}|</janux-island>`;

interface Span {
  island: UntrustedIsland;
  start: number;
  end: number;
}

/** The end of the island that opens at `from`, counting nested islands in between. */
function islandEnd(html: string, from: number): number {
  let depth = 0;

  for (const tag of html.slice(from).matchAll(new RegExp(ISLAND_TAG, 'gi'))) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return from + tag.index + tag[0].length;
  }

  return html.length;
}

/** Where each untrusted island's markup starts and ends, outermost first. */
function untrustedSpans(html: string, islands: UntrustedIsland[]): Span[] {
  const byId = new Map(islands.map((island) => [island.id, island]));
  const found = [...html.matchAll(new RegExp(ISLAND_OPEN, 'gi'))].flatMap((tag) => {
    const island = byId.get(/data-jx="([^"]*)"/.exec(tag[0])?.[1] ?? '');

    return island ? [{ island, start: tag.index, end: islandEnd(html, tag.index) }] : [];
  });

  // An island nested inside one already fenced needs no fence of its own.
  return found.filter((span) => !found.some((outer) => outer.start < span.start && span.start < outer.end));
}

/**
 * Untrusted content is delimited where it is projected, not filtered.
 *
 * The island whose state declares `untrusted()` fields is the boundary: its
 * rendered subtree is converted on its own and fenced, so the model is told
 * exactly where a stranger's text starts and stops. The document the browser
 * gets is untouched — only the agent-facing projection carries the markers.
 */
function fenceIslands(html: string, islands: UntrustedIsland[]): string {
  const spans = untrustedSpans(html, islands);

  if (spans.length === 0) return htmlToMarkdown(html);
  const pieces = spans.flatMap(({ island, start, end }, index) => [
    htmlToMarkdown(html.slice(index === 0 ? 0 : spans[index - 1]!.end, start)),
    fenceUntrusted(htmlToMarkdown(html.slice(start, end)), { source: 'user-input', from: island.uri }),
  ]);

  return [...pieces, htmlToMarkdown(html.slice(spans.at(-1)!.end))].filter(Boolean).join('\n\n');
}

export function pageMarkdown(title: string | undefined, html: string, untrusted: UntrustedIsland[] = []): string {
  const body = fenceIslands(html, untrusted);

  return title && !body.startsWith('# ') ? `# ${title}\n\n${body}` : body;
}
