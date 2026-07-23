import { createFsRouter, type Matcher } from './router';
import type { Ctx } from 'janux';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface HandlerContext {
  req: Request;
  params: Record<string, string>;
  ctx: Ctx;
  url: URL;
}

export type RouteHandler = (context: HandlerContext) => Response | Promise<Response>;
export type HandlerModule = Partial<Record<HttpMethod, RouteHandler>>;

export interface HttpHandlersOptions {
  /** Directory of `src/api/**` handler files (same grammar as pages). */
  dir: string;
  /** URL prefix the handlers mount under. Default: `/api`. */
  prefix?: string;
  loadModule: (filePath: string) => Promise<HandlerModule>;
  matchers?: Record<string, Matcher>;
}

/**
 * Arbitrary HTTP route handlers (RFC 0002 §10.1): a `src/api/**` tree whose
 * files export method functions returning a Web `Response`. Same dynamic/
 * catch-all grammar as pages; the surface for REST endpoints, webhooks, OAuth
 * authorization-server routes, well-known documents and file up/downloads.
 */
export function createHttpHandlers(options: HttpHandlersOptions) {
  const prefix = options.prefix ?? '/api';
  const router = createFsRouter(options.dir, options.matchers);

  return {
    /** True if `pathname` falls under the handlers prefix. */
    handles(pathname: string): boolean {
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    },

    async dispatch(req: Request, ctx: Ctx): Promise<Response> {
      const url = new URL(req.url);
      const subPath = url.pathname.slice(prefix.length) || '/';
      const match = router.match(subPath);

      if (!match) return new Response('Not found', { status: 404 });
      const module = await options.loadModule(match.filePath);
      const method = req.method.toUpperCase() as HttpMethod;
      const handler = module[method] ?? (method === 'HEAD' ? module.GET : undefined);

      if (!handler) {
        const allow = Object.keys(module).join(', ');

        return new Response('Method not allowed', { status: 405, headers: allow ? { allow } : undefined });
      }

      return handler({ req, params: match.params, ctx, url });
    },
  };
}
