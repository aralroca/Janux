import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

/**
 * The CLI projection, driven exactly as a script or a CI job drives it: the
 * `janux` binary this app already depends on, in this app's directory, with no
 * server running and nothing declared for it.
 *
 * `bun test` gives the child no terminal, so every case here is the
 * non-interactive one — which is the point for `guard: 'confirm'`. The
 * interactive half (approve / decline at the prompt) is covered where the
 * answer can be injected: packages/janux-cli/src/run.test.ts.
 */

const ROOT = join(import.meta.dirname, '..');
const JANUX = join(ROOT, 'node_modules/.bin/janux');

async function janux(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([JANUX, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);

  return { code: await child.exited, stdout, stderr };
}

describe('janux run, in this app', () => {
  it('lists the tools the manifest advertises — intents and api() in one surface', async () => {
    const { code, stdout } = await janux('run');

    expect(code).toBe(0);
    expect(stdout).toContain('cart.addItem');
    expect(stdout).toContain('api.shop.catalog');
    expect(stdout).toContain('[confirm]');
  }, 30_000);

  it('generates the usage from the schema the intent already declares', async () => {
    const { code, stdout } = await janux('run', 'cart.addItem', '--help');

    expect(code).toBe(0);
    expect(stdout).toContain('--productId <string>');
    expect(stdout).toContain('--qty <integer>');
    expect(stdout).toContain('required');
  }, 30_000);

  it('refuses an argument the schema never declared', async () => {
    const { code, stderr } = await janux('run', 'cart.addItem', '--product', 'p1');

    expect(code).toBe(1);
    expect(stderr).toContain('--product');
  }, 30_000);
});

describe('guard: auto', () => {
  it('runs an intent from the terminal', async () => {
    const { code, stdout, stderr } = await janux('run', 'cart.addItem', '--productId', 'p1', '--qty', '2');

    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('null');
  }, 30_000);

  it('runs an api() and prints its result as JSON a script can pipe', async () => {
    const { code, stdout } = await janux('run', 'api.shop.catalog');

    expect(code).toBe(0);
    expect(JSON.parse(stdout).products).toHaveLength(3);
  }, 30_000);
});

describe('guard: confirm', () => {
  it('fails instead of auto-approving when nobody is at the terminal', async () => {
    const { code, stdout, stderr } = await janux('run', 'api.shop.pay', '--total', '5999');

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('confirm');
    expect(stderr).toContain('Nothing ran');
  }, 30_000);

  it('never charges: no order id comes back from a refused call', async () => {
    const { stdout } = await janux('run', 'api.shop.pay', '--total', '5999');

    expect(stdout).not.toContain('orderId');
  }, 30_000);

  /**
   * `checkout` declares `ready: state.items.length > 0`. A terminal has no
   * session, so the intent runs against a fresh render of `/shop` with an empty
   * cart and the pipeline says so — the same answer an agent gets. Pinned here
   * because it is a property of the app's own declaration, not a CLI limit.
   */
  it('still answers to `ready` — a fresh render is not a shopping session', async () => {
    const { code, stderr } = await janux('run', 'cart.checkout');

    expect(code).toBe(1);
    expect(stderr).toContain('not ready');
  }, 30_000);
});

describe('a forbidden tool', () => {
  it('is not even listed — the CLI advertises what an agent may call', async () => {
    const { stdout } = await janux('run');

    expect(stdout).not.toContain('forbidden');
  }, 30_000);
});
