import { safeAttr } from './html-escape';

/**
 * `sitemap.xml` and `robots.txt` from the pages the router already knows —
 * the same `listPages()` that feeds llms.txt, so dynamic routes appear as their
 * real URLs via `staticParams` rather than as `[id]` patterns.
 *
 * Both need an absolute origin, so both are opt-in through `siteUrl`: a sitemap
 * of relative paths is invalid, and a robots.txt pointing nowhere is worse than
 * none at all.
 */

/** A page pattern that still carries params never resolved to a real URL. */
function isConcrete(page: string): boolean {
  return !page.includes('[');
}

export function buildSitemap(siteUrl: string, pages: string[]): string {
  const urls = pages
    .filter(isConcrete)
    .map((page) => `  <url><loc>${safeAttr(new URL(page, siteUrl).href)}</loc></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', siteUrl).href}\n`;
}
