import { describe, expect } from 'bun:test';
import { buildSitemap } from '../../janux-server/src/sitemap';
import { runCases } from '../support/scenario';
import { SITEMAP_CASES } from './sitemap.cases';

/** The envelope every sitemap carries, so a row states only its `<loc>` values. */
const open = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

describe('sitemap.xml', () =>
  runCases(SITEMAP_CASES, (row) => {
    const urls = row.expected.map((loc) => `  <url><loc>${loc}</loc></url>`).join('\n');

    expect(buildSitemap(row.siteUrl, row.pages)).toBe(`${open}${urls}\n</urlset>\n`);
  }));
