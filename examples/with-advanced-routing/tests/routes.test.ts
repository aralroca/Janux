import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { createTestApp, type TestApp } from '@janux/testing';

const ROOT = join(import.meta.dirname, '..');

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp(ROOT);
});

afterAll(() => app.close());

describe('the layout chain stacks from the root down', () => {
  it('wraps a plain page in the root shell alone', async () => {
    const page = await app.render('/wiki');

    expect(page.html).toContain('data-shell="root"');
    expect(page.html).not.toContain('data-shell="marketing"');
  });

  /** `(marketing)` never shows up in the URL, but its layout still wraps the page. */
  it('adds the group layout for a page inside a (group) directory', async () => {
    const page = await app.render('/pricing');

    expect(page.html).toContain('data-shell="root"');
    expect(page.html).toContain('data-shell="marketing"');
  });
});

describe('the segment grammar decides what a URL reaches', () => {
  it('routes a numeric ticket to the integer-matched page', async () => {
    const page = await app.render('/tickets/42');

    expect(page.status).toBe(200);
    expect(page.html).toContain('Ticket #42');
  });

  it('answers the 404 page when no matcher accepts the segment', async () => {
    const page = await app.render('/tickets/not-a-ticket');

    expect(page.status).toBe(404);
  });

  it('hands every remaining segment to a catch-all', async () => {
    const page = await app.render('/docs/guides/install');

    expect(page.status).toBe(200);
    expect(page.html).toContain('guides/install');
  });
});

describe('the layout reads the request ctx', () => {
  it('marks the section the current URL belongs to', async () => {
    const page = await app.render('/wiki');

    expect(page.html).toContain('aria-current="page"');
  });
});
