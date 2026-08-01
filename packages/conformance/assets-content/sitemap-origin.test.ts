import { describe, expect } from 'bun:test';
import { buildRobotsTxt, validSiteUrl } from '../../janux-server/src/sitemap';
import { runCases } from '../support/scenario';
import { SITE_ORIGIN_CASES } from './sitemap-origin.cases';

describe('site origin and robots.txt', () =>
  runCases(SITE_ORIGIN_CASES, (row) => {
    const normalized = validSiteUrl(row.siteUrl);

    expect(normalized).toBe(row.normalized!);
    // robots.txt is only ever built from an origin that passed the check.
    expect(normalized === undefined ? undefined : buildRobotsTxt(normalized)).toBe(
      row.sitemapLine === undefined ? undefined! : `User-agent: *\nAllow: /\n\nSitemap: ${row.sitemapLine}\n`,
    );
  }));
