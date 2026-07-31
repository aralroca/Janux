import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fontPreloadHrefs } from 'janux';
import { builtFontAssets, fontCacheDir, fontResponse, resolveFonts, writeFontAssets } from './fonts';

const FIXTURES = join(import.meta.dir, '__fixtures__/fonts');
const CSS = readFileSync(join(FIXTURES, 'inter.css'), 'utf8');
const WOFF2 = readFileSync(join(FIXTURES, 'inter-latin-400.woff2'));

const roots: string[] = [];

function appRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-fonts-'));

  roots.push(root);

  return root;
}

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

/** A network that answers from the fixtures and counts what it was asked for. */
function fakeNetwork() {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);

    return url.endsWith('.woff2') ? new Response(WOFF2) : new Response(CSS);
  };

  return { calls, fetchImpl };
}

describe('resolving a font end to end', () => {
  it('self-hosts every selected file and measures the real one', async () => {
    const root = appRoot();
    const { fetchImpl } = fakeNetwork();
    const [font] = await resolveFonts(root, [{ family: 'Inter', weights: [400], subsets: ['latin'] }], fetchImpl);

    expect(font!.faces.every((face) => face.url.startsWith('/_janux/font/'))).toBe(true);
    expect(font!.faces.every((face) => face.url.endsWith('.woff2'))).toBe(true);
    expect(existsSync(join(fontCacheDir(root), font!.faces[0]!.url.slice('/_janux/font/'.length)))).toBe(true);
    // Inter's real head metrics, read out of the downloaded file — not a table.
    expect(font!.overrides.sizeAdjust).toBe('107.12%');
    expect(font!.overrides.ascentOverride).toBe('90.44%');
  });

  it('carries the declared display and custom property through to the CSS layer', async () => {
    const root = appRoot();
    const { fetchImpl } = fakeNetwork();
    const config = { family: 'Inter', subsets: ['latin'], display: 'optional' as const, variable: '--font-sans' };
    const [font] = await resolveFonts(root, [config], fetchImpl);

    expect(font!.display).toBe('optional');
    expect(font!.variable).toBe('--font-sans');
    expect(font!.fallback).toBe('sans-serif');
  });

  /**
   * The build must not depend on the network on every run. Once the cache has
   * the CSS, the files and the metrics, a second resolve is pure disk — which is
   * what makes a CI build reproducible and an offline `janux dev` possible.
   */
  it('touches the network once and never again', async () => {
    const root = appRoot();
    const first = fakeNetwork();
    const second = fakeNetwork();
    const config = [{ family: 'Inter', weights: [400], subsets: ['latin'] }];

    await resolveFonts(root, config, first.fetchImpl);
    expect(first.calls.length).toBeGreaterThan(0);

    await resolveFonts(root, config, second.fetchImpl);
    expect(second.calls).toEqual([]);
  });

  it('is a no-op for an app that declares no fonts', async () => {
    expect(await resolveFonts(appRoot(), [])).toEqual([]);
  });

  /**
   * Google answers the CSS2 API with TTF unless the request looks like a modern
   * browser, and a TTF response carries neither subset comments nor
   * `unicode-range` — so without the header the resolver quietly selects nothing.
   */
  it('asks as a browser, which is the only way woff2 comes back', async () => {
    const seen: (RequestInit | undefined)[] = [];
    const spy = async (url: string, init?: RequestInit) => {
      seen.push(init);

      return url.endsWith('.woff2') ? new Response(WOFF2) : new Response(CSS);
    };

    await resolveFonts(appRoot(), [{ family: 'Inter', subsets: ['latin'] }], spy);
    expect(String((seen[0]?.headers as Record<string, string>)?.['user-agent'])).toContain('Chrome');
  });

  it('refuses a subset the family does not publish, rather than shipping a font with no faces', () => {
    const { fetchImpl } = fakeNetwork();

    expect(resolveFonts(appRoot(), [{ family: 'Inter', subsets: ['klingon'] }], fetchImpl)).rejects.toThrow(/klingon/);
  });

  it('says which font it could not fetch instead of silently shipping none', async () => {
    const failing = async () => new Response('nope', { status: 404 });

    expect(resolveFonts(appRoot(), [{ family: 'Nonexistent' }], failing)).rejects.toThrow(/Nonexistent/);
  });
});

/**
 * What a built app carries. `janux start` and `output: "static"` must never
 * resolve anything — no CSS2 request, no metrics parse, no cache lookup — so the
 * build leaves the finished CSS and preload list beside the files themselves.
 */
describe('the artifacts a build leaves behind', () => {
  async function built(): Promise<{ root: string; outDir: string }> {
    const root = appRoot();
    const outDir = join(root, 'dist/client');

    await writeFontAssets(root, [{ family: 'Inter', weights: [400], subsets: ['latin'], variable: '--font-sans' }], outDir, fakeNetwork().fetchImpl);

    return { root, outDir };
  }

  it('copies the woff2 to the URL the @font-face points at', async () => {
    const { outDir } = await built();
    const href = builtFontAssets(outDir).fontPreloads![0]!;

    expect(existsSync(join(outDir, href.slice(1)))).toBe(true);
  });

  it('reads back as finished CSS and a preload list, with no resolver in sight', async () => {
    const { outDir } = await built();
    const assets = builtFontAssets(outDir);

    expect(assets.fontFaces).toContain('size-adjust:107.12%');
    expect(assets.fontFaces).toContain(":root{--font-sans:'Inter'");
    expect(assets.fontPreloads).toHaveLength(1);
  });

  it('is empty for a build that never declared a font', () => {
    expect(builtFontAssets(join(appRoot(), 'dist/client'))).toEqual({});
  });
});

describe('serving a font in dev', () => {
  it('answers from the resolver cache, since dev has no build output', async () => {
    const root = appRoot();
    const [font] = await resolveFonts(root, [{ family: 'Inter', weights: [400], subsets: ['latin'] }], fakeNetwork().fetchImpl);
    const response = fontResponse(root, font!.faces[0]!.url);

    expect(response?.headers.get('content-type')).toBe('font/woff2');
  });

  it.each([
    ['a path that is not a font request', '/styles.css'],
    ['a file the resolver never wrote', '/_janux/font/nope.woff2'],
    ['a traversal attempt', '/_janux/font/../../secret.woff2'],
  ])('passes on %s', (_why, path) => {
    expect(fontResponse(appRoot(), path)).toBeUndefined();
  });
});

/**
 * Google ships most families as ONE variable file covering the whole weight
 * range, so every declared weight points at the same URL. Naming the self-hosted
 * copy after the weight would make the browser download the same 47 KB once per
 * weight — the file is named after its source instead.
 */
describe('a family Google serves as one variable file', () => {
  it('self-hosts it once, however many weights point at it', async () => {
    const root = appRoot();
    const config = [{ family: 'Inter', weights: [400, 600], subsets: ['latin'] }];
    const [font] = await resolveFonts(root, config, fakeNetwork().fetchImpl);

    expect(font!.faces.map((face) => face.weight)).toEqual([400, 600]);
    expect(new Set(font!.faces.map((face) => face.url)).size).toBe(1);
  });

  it('preloads that one file once, not once per weight', async () => {
    const root = appRoot();
    const config = [{ family: 'Inter', weights: [400, 600], subsets: ['latin'] }];
    const fonts = await resolveFonts(root, config, fakeNetwork().fetchImpl);

    expect(fontPreloadHrefs(fonts)).toHaveLength(1);
  });
});
