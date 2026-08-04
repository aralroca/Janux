import { prodServerOptions } from '@janux/cli/prod';
import { createJanuxServer, type CtxBag, type ServerOptions } from '@janux/server';
import { publishAppRoot } from '@janux/vite';
import { restoreAppRoot } from './test-server';
import type { Ctx } from 'janux';

export interface TestAppOptions {
  /** Values forced over whatever the app's own `src/ctx.ts` resolves — an authenticated user, a feature flag. */
  ctx?: Record<string, unknown>;
}

export interface RenderedPage {
  status: number;
  headers: Headers;
  html: string;
}

export interface TestApp {
  /** The full server underneath, for what the harness does not wrap: `listPages()`, `manifestFor()`, `apiTools`. */
  server: ReturnType<typeof createJanuxServer>;
  /** The raw HTTP boundary: any path the app serves, middleware included. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** Renders a route through its `_layout` chain and middleware, fully streamed. */
  render(path: string, init?: RequestInit): Promise<RenderedPage>;
  /** The agent manifest of a rendered page: islands, tools, route patterns. */
  manifest(path: string): Promise<unknown>;
  /**
   * Puts back the app root this harness published. It is process-global, so
   * apps opened in one process must be closed in reverse order.
   */
  close(): void;
}

function forcedCtx(base: ServerOptions['ctxFor'], forced: Record<string, unknown>): ServerOptions['ctxFor'] {
  // The bag travels through untouched: the app's own `ctxFor` still sees the
  // session and the agent identity the server verified for this request.
  return async (req: Request, bag: CtxBag): Promise<Ctx> => ({ ...(await base?.(req, bag)), ...forced });
}

/**
 * The route-level harness: the same server `janux start` runs, in-process,
 * loading routes, layouts, middleware, ctx and api() modules straight from
 * `root` — no build and no port. HTML comes back fully streamed, so what a
 * suspense boundary resolves to is already in `render().html`.
 */
export async function createTestApp(root: string, options: TestAppOptions = {}): Promise<TestApp> {
  const previousRoot = process.env.JANUX_APP_ROOT;

  publishAppRoot(root);
  const serverOptions = await prodServerOptions(root);
  const ctxFor = options.ctx ? forcedCtx(serverOptions.ctxFor, options.ctx) : serverOptions.ctxFor;
  const server = createJanuxServer({ ...serverOptions, ctxFor });
  const request = (path: string, init?: RequestInit) => server.fetch(new Request(`http://test${path}`, init));

  return {
    server,
    fetch: request,
    async render(path, init) {
      const response = await request(path, init);

      return { status: response.status, headers: response.headers, html: await response.text() };
    },
    async manifest(path) {
      const response = await request(`/_janux/manifest?path=${encodeURIComponent(path)}`);

      return response.json();
    },
    close() {
      restoreAppRoot(previousRoot);
    },
  };
}
