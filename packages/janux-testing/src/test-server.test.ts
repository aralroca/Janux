import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { hasNodeBuild, isBuilt, startTestServer } from './test-server';

const FIXTURE = join(import.meta.dirname, '__fixtures__/harness-app');

/** Stands in for `janux build` output, like janux-cli's prod tests do. */
function buildFixture(): void {
  mkdirSync(join(FIXTURE, 'dist/client'), { recursive: true });
  writeFileSync(join(FIXTURE, 'dist/client/asset.txt'), 'static bytes');
}

afterEach(() => rmSync(join(FIXTURE, 'dist'), { recursive: true, force: true }));

describe('isBuilt / hasNodeBuild', () => {
  it('reports whether janux build ran for the app', () => {
    expect(isBuilt(FIXTURE)).toBe(false);
    buildFixture();
    expect(isBuilt(FIXTURE)).toBe(true);
  });

  it('reports whether the node adapter ran for the app', () => {
    expect(hasNodeBuild(FIXTURE)).toBe(false);
  });
});

describe('startTestServer serves the built app like janux start', () => {
  it('answers pages and static assets on a real port, and stop() frees it', async () => {
    buildFixture();
    const { url, stop } = await startTestServer(FIXTURE);
    const page = await fetch(`${url}/`);
    const asset = await fetch(`${url}/asset.txt`);

    expect(await page.text()).toContain('home page');
    expect(await asset.text()).toBe('static bytes');
    stop();
    expect(fetch(`${url}/`)).rejects.toThrow();
  });

  it('hands every request/response pair to the observe hook', async () => {
    buildFixture();
    const seen: string[] = [];
    const { url, stop } = await startTestServer(FIXTURE, {
      observe: (req, res) => seen.push(`${new URL(req.url).pathname}:${res.status}`),
    });

    await fetch(`${url}/admin`);
    expect(seen).toEqual(['/admin:403']);
    stop();
  });
});

/**
 * The app root is process-global (`JANUX_APP_ROOT`), so a server that publishes
 * one and never puts it back points every OTHER live app's root-relative
 * lookups — content collections, fonts, instrumentation — at its own directory.
 */
describe('startTestServer and the published app root', () => {
  it('restores the root it published when the server stops', async () => {
    process.env.JANUX_APP_ROOT = '/srv/other';
    buildFixture();
    const { stop } = await startTestServer(FIXTURE);

    expect(process.env.JANUX_APP_ROOT).toBe(FIXTURE);
    stop();

    expect(process.env.JANUX_APP_ROOT).toBe('/srv/other');
    delete process.env.JANUX_APP_ROOT;
  });
});
