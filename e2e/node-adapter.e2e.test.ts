import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Browser } from 'playwright';
import { TIMEOUT, hasNodeBuild, launchBrowser, openPage, serveNode } from './support/app';

/**
 * The suite that runs against the Node build rather than the Bun one.
 *
 * Every other e2e suite serves the app in this process, which is Bun — so all of
 * them would keep passing on the day the Node adapter stopped producing a
 * runnable bundle. These drive a real Chrome against a real `node build/index.js`
 * on two apps: `examples/with-node-adapter`, which exists to be deployed this
 * way, and `examples/shop`, which does not — it is a normal app that happens to
 * be built for Node, which is the whole claim the adapter makes.
 *
 * Both need `bun run build:node` first; without it the suites skip rather than
 * fail, matching how the Bun suites treat a missing `dist/client`.
 */

const NODE_APP = 'examples/with-node-adapter';
const SHOP = 'examples/shop';
const BUILT = hasNodeBuild(NODE_APP) && hasNodeBuild(SHOP);

let node: Awaited<ReturnType<typeof serveNode>> | undefined;
let shop: Awaited<ReturnType<typeof serveNode>> | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  [node, shop] = await Promise.all([serveNode(NODE_APP, 31731), serveNode(SHOP, 31732)]);
  browser = await launchBrowser();
}, TIMEOUT);

afterAll(() => {
  node?.stop();
  shop?.stop();
});

describe.if(BUILT)('the Node build serves the app', () => {
  it('is served by node, and says so', async () => {
    const html = await (await fetch(node!.base)).text();

    expect(html).toContain('Running on Node');
    expect(node!.output.text).toMatch(/janux-node: serving on .+ \(node \d+\./);
  });

  /** Node 24 is the floor the package declares; anything older is a deployment that will not boot. */
  it('runs on Node 24 or newer', () => {
    const version = /\(node (\d+)\./.exec(node!.output.text)?.[1];

    expect(Number(version)).toBeGreaterThanOrEqual(24);
  });

  it('answers an api() endpoint, so RPC survives the bundle', async () => {
    const response = await fetch(`${node!.base}/_janux/api/runtime.whoami`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: '{}',
    });

    expect(await response.json()).toEqual({ ok: true, result: { runtime: 'Node', version: expect.any(String) } });
  });

  it('keeps the agent surface: the island and its intents are in the manifest', async () => {
    const manifest: any = await (await fetch(`${node!.base}/_janux/manifest?path=%2F`)).json();

    expect(manifest.resources.map((resource: any) => resource.uri)).toContain('ui://runtime-card');
    expect(manifest.tools.map((tool: any) => tool.name)).toEqual(
      expect.arrayContaining(['runtime-card.bump', 'api.runtime.whoami']),
    );
  });

  /**
   * `capabilities.websocket: true` is the one claim Node makes that Vercel does
   * not, and it is the claim most likely to be quietly false: `ws` reaches the
   * bundle only if the bundler could see the specifier, and the app's `src/ws.ts`
   * only through the generated module map.
   */
  it('holds a WebSocket open, the capability the adapter declares', async () => {
    const socket = new WebSocket(`${node!.base.replace('http', 'ws')}/ws`);
    const frames: any[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`only saw ${JSON.stringify(frames)}`)), 10_000);

      socket.onmessage = (event) => {
        frames.push(JSON.parse(String(event.data)));
        if (frames.length === 1) socket.send('ping from the test');
        if (frames.length === 2) {
          clearTimeout(timer);
          resolve();
        }
      };
      socket.onerror = () => reject(new Error('the WebSocket never connected'));
    });
    socket.close();

    expect(frames[0]).toMatchObject({ type: 'welcome' });
    expect(frames[1]).toMatchObject({ type: 'echo', text: 'ping from the test' });
    // The handler runs in the deployment, so it reports the deployment's runtime.
    expect(frames[1].runtime).toStartWith('Node ');
  }, TIMEOUT);

  it('closes an upgrade on a path it has no handler for, instead of leaking the socket', async () => {
    const socket = new WebSocket(`${node!.base.replace('http', 'ws')}/nope`);

    await expect(
      new Promise((resolve, reject) => {
        socket.onerror = () => reject(new Error('refused'));
        socket.onopen = () => resolve('opened');
        setTimeout(() => resolve('left hanging'), 5_000);
      }),
    ).rejects.toThrow('refused');
  }, TIMEOUT);

  it('serves the built client compressed, with the content type the browser needs', async () => {
    const response = await fetch(`${node!.base}/client.js`, { headers: { 'accept-encoding': 'br, gzip' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('content-encoding')).toBe('br');
  });
});

describe.if(BUILT)('the island hydrates from the bundle Node served', () => {
  it('counts clicks in the browser, with no page load', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(node!.base, { waitUntil: 'networkidle' });
    // Server-rendered first: the number is in the HTML before any JS runs.
    expect(await page.getByTestId('clicks').textContent()).toBe('0');
    expect(await page.getByTestId('runtime').textContent()).toBe('Node');

    await page.getByTestId('bump').click();
    await page.getByTestId('bump').click();
    expect(await page.getByTestId('clicks').textContent()).toBe('2');

    await page.getByTestId('reset').click();
    expect(await page.getByTestId('clicks').textContent()).toBe('0');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});

/**
 * The acceptance case: an app written with no thought for Node at all, built for
 * Node and driven through the browser.
 */
describe.if(BUILT)('examples/shop under Node', () => {
  it('server-renders the shop', async () => {
    const html = await (await fetch(`${shop!.base}/shop`)).text();

    expect(html).toContain('<title>Janux Shop');
    expect(html).toContain('janux-island');
  });

  it('adds to the cart in a real browser', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(`${shop!.base}/shop`, { waitUntil: 'networkidle' });
    const addButtons = page.locator('button', { hasText: /add/i });

    await addButtons.first().click();
    await page.waitForFunction(() => /[1-9]/.test(document.body.innerText), undefined, { timeout: 10_000 });

    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('keeps the CSRF guard on the invocation pipeline', async () => {
    const response = await fetch(`${shop!.base}/_janux/api/shop.saveCart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: 'cross_site_denied' });
  });
});
