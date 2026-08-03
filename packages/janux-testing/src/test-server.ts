import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { prodServerOptions } from '@janux/cli/prod';
import { staticResponse } from '@janux/cli';
import { createJanuxServer } from '@janux/server';
import { publishAppRoot } from '@janux/vite';

/** Whether `janux build` ran for the app — browser suites skip otherwise. */
export function isBuilt(root: string): boolean {
  return existsSync(join(root, 'dist/client'));
}

/** Whether the node adapter (`janux-node`) ran for the app. */
export function hasNodeBuild(root: string): boolean {
  return existsSync(join(root, 'build/index.js'));
}

export interface TestServer {
  url: string;
  stop(): void;
}

export interface TestServerOptions {
  /**
   * Sees every request paired with the response it got — how a suite asserts on
   * what the browser actually sent. A hook rather than a proxy on purpose:
   * standing a second server in front and awaiting a loopback fetch starved
   * under a loaded suite and delivered empty response bodies.
   */
  observe?: (req: Request, res: Response) => void;
}

/**
 * Serves the built app like `janux start` does, on an auto-assigned port.
 *
 * The app root it publishes is process-global, so `stop()` puts back whatever
 * was there before: two servers for different apps otherwise leave the loser
 * resolving content collections, fonts and instrumentation against the winner's
 * directory.
 */
export async function startTestServer(root: string, options: TestServerOptions = {}): Promise<TestServer> {
  const previousRoot = process.env.JANUX_APP_ROOT;

  publishAppRoot(root);
  const app = createJanuxServer(await prodServerOptions(root));
  const staticDir = join(root, 'dist/client');
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const res = (await staticResponse(staticDir, req)) ?? (await app.fetch(req));

      options.observe?.(req, res);

      return res;
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    stop: () => {
      server.stop(true);
      restoreAppRoot(previousRoot);
    },
  };
}

/** Puts `JANUX_APP_ROOT` back, deleting it when there was none to begin with. */
export function restoreAppRoot(previous: string | undefined): void {
  if (previous === undefined) delete process.env.JANUX_APP_ROOT;
  else process.env.JANUX_APP_ROOT = previous;
}

export interface NodeServer {
  url: string;
  output: { text: string };
  stop(): void;
}

async function collect(stream: ReadableStream<Uint8Array>, output: { text: string }): Promise<void> {
  const decoder = new TextDecoder();

  for await (const chunk of stream) output.text += decoder.decode(chunk, { stream: true });
}

/** Polls until the server answers, so the caller gets a running app or a real error. */
async function waitForUp(url: string, attempts = 150): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fetch(url);

      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return false;
}

/**
 * Serves the app the way a deployment does: `node build/index.js`, in its own
 * process, with no Bun anywhere in it. The other helpers run the server in
 * *this* process, which cannot answer the question this one exists for — a
 * bundle that only works because Bun happened to import it would pass them all.
 *
 * Both pipes are drained for the process's whole life, not just on failure: an
 * undrained one fills its OS buffer and blocks the server mid-suite, which
 * looks like a hang rather than a failure. `console.error` output is a normal
 * thing for an app to produce, so this is a matter of when, not if.
 */
export async function startNodeServer(root: string, port: number): Promise<NodeServer> {
  const child = Bun.spawn(['node', join(root, 'build/index.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const url = `http://localhost:${port}`;
  const output = { text: '' };
  const drained = Promise.all([
    collect(child.stdout as ReadableStream<Uint8Array>, output),
    collect(child.stderr as ReadableStream<Uint8Array>, output),
  ]);

  if (await waitForUp(url)) return { url, output, stop: () => child.kill() };

  child.kill();
  await drained.catch(() => {});
  throw new Error(`${root}: the node server never came up.\n${output.text}`);
}
