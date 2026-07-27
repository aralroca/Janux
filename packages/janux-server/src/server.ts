import {
  buildManifest,
  renderToStream,
  selectMessages,
  translateCore,
  type AuditEntry,
  type ComponentDef,
  type Ctx,
  type I18n,
  type I18nConfig,
  type NavigationConfig,
  type PageMeta,
  type RenderResult,
  type RenderStream,
} from 'janux';
import { QueryClient } from 'janux/query';
import { createHttpHandlers, type HandlerModule } from './http-handlers';
import { createMcpEndpoint, type McpAuth } from './mcp';
import { pageMarkdown } from './md-projection';
import { detectLocale, localeDir, splitLocale } from './i18n-routing';
import type { ShellI18n } from './html-shell';
import { assertValidInput, errorStatus, evictOldestProposal, json, proposalId, type PendingApiProposal } from './http';
import { apiAuditEntry, apiManifestTools, collectApis, invokeApi, resolveApiGuard, type ApiTool } from './api';
import { createAgentAuth, type AgentIdentity, type AgentsConfig } from './agent-auth';
import { createFsRouter, type Route } from './router';
import { shellParts, type ShellOptions } from './html-shell';
import { safeJson } from './html-escape';
import { buildLlmsTxt, expandPattern, type LlmsTxtConfig, type LlmsTxtTool } from './llms-txt';
import { buildRobotsTxt, buildSitemap, validSiteUrl } from './sitemap';

/**
 * Set by the client runtime on a navigation fetch. What the document already has
 * (the app's CSS) does not need to travel again — see handlePage.
 */
export const NAVIGATION_HEADER = 'x-janux-navigation';

export interface AgentMount {
  handle(req: Request, deps: AgentDeps): Promise<Response>;
  /** One-turn LLM proxy for browser-side agent loops (`serverLlm()` from `@janux/agent/local`). */
  handleLlm?(req: Request): Promise<Response>;
}

export interface AgentDeps {
  tools: ApiTool[];
  invoke: (tool: string, input: unknown) => Promise<unknown>;
  manifestFor: (path: string) => Promise<unknown>;
}

export interface ServerOptions {
  routesDir?: string;
  loadRoute?: (filePath: string) => Promise<Record<string, unknown>>;
  routes?: Record<string, (props: { ctx: Ctx; params: Record<string, string> }) => unknown>;
  apis?: Record<string, Record<string, unknown>>;
  storeDefs?: Record<string, ComponentDef>;
  agent?: AgentMount;
  ctxFor?: (req: Request) => Ctx | Promise<Ctx>;
  runtimeUrl?: string;
  islandModules?: Record<string, string>;
  title?: string;
  lang?: string;
  /** Origin a route's relative `image`/`canonical` resolve against, and the sitemap's base. */
  siteUrl?: string;
  stylesheets?: string[];
  /** CSS inlined into every page instead of linked (see `inlineStyles` in the app config). */
  inlineStyles?: string[];
  favicon?: string;
  llmsTxt?: LlmsTxtConfig;
  agents?: AgentsConfig;
  onAudit?: (entry: AuditEntry) => void;
  i18n?: I18nConfig;
  /** App-context resolver for the foreign runtime (react / react-dom/server). */
  foreignImport?: (spec: string) => Promise<any>;
  /** Custom typed-param matchers for `[param=matcher]` route segments. */
  matchers?: Record<string, (value: string) => boolean>;
  /** Runs before routing; returning a Response short-circuits the request. */
  middleware?: (req: Request) => Response | undefined | Promise<Response | undefined>;
  /** Arbitrary HTTP handlers: a `src/api/**` tree mounted (by default) at `/api`. */
  httpHandlers?: { dir: string; prefix?: string; loadModule: (filePath: string) => Promise<HandlerModule> };
  /** Bearer verification for the hosted MCP endpoint (`/_janux/mcp`). Absent → open. */
  mcpAuth?: McpAuth;
  /**
   * Prerendering for a static host: omit links to `/_janux/*`, which won't
   * exist there. Without it every static page fetches a 404 manifest.
   */
  staticExport?: boolean;
  /** SPA navigation, prefetching and speculation rules (`navigation` in the app config). */
  navigation?: NavigationConfig;
}

async function resolveMeta(
  rawMeta: unknown,
  ctx: Ctx,
  params: Record<string, string>,
): Promise<PageMeta | undefined> {
  try {
    return typeof rawMeta === 'function' ? await rawMeta({ ctx, params }) : (rawMeta as any);
  } catch {
    return undefined;
  }
}

async function resolveStaticParams(rawParams: unknown): Promise<Array<Record<string, unknown>>> {
  try {
    const value = typeof rawParams === 'function' ? await rawParams() : rawParams;

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}


type RenderSummary = Omit<RenderResult, 'html'>;

/**
 * A render that fails after the first flush cannot change the status line
 * anymore, so the failure is reported in-page: `janux:error` for the app (the
 * same event a failed navigation fetch dispatches) plus a console trace, and
 * the document is closed so the parser is never left mid-tag. No auto-reload:
 * a deterministic render error would just fail the same way again.
 */
function streamErrorScript(error: unknown): string {
  const detail = safeJson(String(error));

  return `\n<script key="jx-stream-error">document.dispatchEvent(new CustomEvent("janux:error",{detail:${detail}}));console.error("janux: render failed mid-stream",${detail})</script>\n</body>\n</html>`;
}

/**
 * prelude → body chunks → epilogue, byte-identical to the buffered
 * `htmlDocument()` (see shellParts). Pull-based so a slow reader applies
 * backpressure instead of buffering the page in memory.
 */
function documentStream(
  prelude: string,
  body: AsyncGenerator<string>,
  epilogue: () => Promise<string>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let head: string | undefined = `${prelude}\n`;
  let sentBody = false;

  return new ReadableStream({
    async pull(controller) {
      if (head) {
        controller.enqueue(encoder.encode(head));
        head = undefined;

        return;
      }
      try {
        const { value, done } = await body.next();

        if (!done) {
          // Skip empty chunks: `htmlDocument` drops empty html the same way.
          if (value) {
            sentBody = true;
            controller.enqueue(encoder.encode(value));
          }

          return;
        }
        controller.enqueue(encoder.encode(`${sentBody ? '\n' : ''}${await epilogue()}`));
      } catch (error) {
        controller.enqueue(encoder.encode(streamErrorScript(error)));
      }
      controller.close();
    },
  });
}

/** The Janux fullstack server: pages, api() endpoints, manifest, proposals and the agent mount. */
export function createJanuxServer(options: ServerOptions = {}) {
  const apiTools = collectApis(options.apis ?? {});
  const router = options.routesDir ? createFsRouter(options.routesDir, options.matchers) : undefined;
  const httpHandlers = options.httpHandlers
    ? createHttpHandlers({ ...options.httpHandlers, matchers: options.matchers })
    : undefined;
  const loadRoute = options.loadRoute ?? ((filePath: string) => import(/* @vite-ignore */ filePath));
  const proposals = new Map<string, PendingApiProposal>();

  const resolveCtx = async (req: Request): Promise<Ctx> => (await options.ctxFor?.(req)) ?? {};

  const i18nCache = new Map<string, I18n>();
  const i18nFor = (locale: string): I18n => {
    const config = options.i18n!;
    const cached = i18nCache.get(locale) ?? {
      locale,
      defaultLocale: config.defaultLocale,
      locales: config.locales,
      t: translateCore(locale, config),
    };

    i18nCache.set(locale, cached);

    return cached;
  };

  const localize = (pathname: string) =>
    options.i18n ? splitLocale(pathname, options.i18n.locales) : { locale: undefined, pathname };

  const localeCtx = (ctx: Ctx, locale: string | undefined): Ctx =>
    locale ? { ...ctx, i18n: i18nFor(locale) } : ctx;

  const agentAuth = options.agents ? createAgentAuth(options.agents) : undefined;

  // Checked once here so a malformed value degrades to "no social URLs, no
  // sitemap" instead of throwing on every render.
  const siteUrl = validSiteUrl(options.siteUrl);

  let llmsTxtBody: string | undefined;
  // Same reason llms.txt is memoized: building it walks every route and, for a
  // docs-shaped app, reads every content file off disk through `staticParams`.
  let sitemapBody: string | undefined;

  const expandRoute = async (route: Route): Promise<string[]> => {
    if (!route.pattern.includes('[')) return [route.pattern];
    const module = (await loadRoute(route.filePath).catch(() => undefined)) as any;
    const expanded = expandPattern(route.pattern, await resolveStaticParams(module?.staticParams));

    return expanded.length > 0 ? expanded : [route.pattern];
  };

  const listPages = async (): Promise<string[]> => {
    const fsPages = (await Promise.all(router?.routes.map(expandRoute) ?? [])).flat();
    const pages = [...Object.keys(options.routes ?? {}), ...fsPages];

    if (!options.i18n) return pages;

    return options.i18n.locales.flatMap((locale) => pages.map((page) => `/${locale}${page === '/' ? '' : page}`));
  };

  const renderLlmsTxt = async (): Promise<string> =>
    buildLlmsTxt({ title: options.title, ...options.llmsTxt }, await listPages(), apiManifestTools(apiTools, {}) as LlmsTxtTool[]);

  const ctxWithAgent = async (req: Request): Promise<Ctx> => {
    const ctx = await resolveCtx(req);
    const identity = (await agentAuth?.identify(req)) ?? null;

    return identity ? { ...ctx, agent: identity } : ctx;
  };

  const findRoute = (pathname: string) => {
    if (options.routes?.[pathname]) {
      return { render: options.routes[pathname]!, params: {} as Record<string, string>, layouts: [] as string[] };
    }
    const match = router?.match(pathname);

    return match ? { load: match.filePath, params: match.params, layouts: match.layouts } : undefined;
  };

  /** Layouts compose top-down: each `_layout` default export wraps its subtree. */
  const applyLayouts = async (vnode: unknown, layouts: string[], ctx: Ctx, params: Record<string, string>) => {
    const wrapped = [...layouts].reverse().reduce(async (childPromise, layoutPath) => {
      const child = await childPromise;
      const layoutModule = (await loadRoute(layoutPath)) as any;

      return layoutModule.default({ children: child, ctx, params });
    }, Promise.resolve(vnode));

    return wrapped;
  };

  const renderPageStream = async (pathname: string, ctx: Ctx) => {
    const route = findRoute(pathname);

    if (!route) return undefined;
    // A fresh per-request query client keeps SSR deterministic (no cross-request
    // cache bleed) and is the seam for future dehydrate/hydrate.
    (ctx as any).queryClient ??= new QueryClient();
    const module = 'render' in route ? undefined : ((await loadRoute(route.load)) as any);
    const render = 'render' in route ? route.render : module.default;
    const meta = await resolveMeta(module?.meta, ctx, route.params);
    const vnode = await applyLayouts(await render({ ctx, params: route.params }), route.layouts, ctx, route.params);
    const stream = renderToStream(vnode, {
      ctx,
      storeDefs: options.storeDefs,
      foreignImport: options.foreignImport,
    });

    return { ...stream, meta };
  };

  /** Buffered render for consumers that need the whole page at once (manifest, markdown projections). */
  const renderPage = async (pathname: string, ctx: Ctx) => {
    const rendered = await renderPageStream(pathname, ctx);

    if (!rendered) return undefined;
    const parts: string[] = [];

    for await (const chunk of rendered.chunks) parts.push(chunk);

    return { html: parts.join(''), ...(await rendered.done), meta: rendered.meta };
  };

  const manifestFor = async (pathname: string, ctx: Ctx): Promise<unknown> => {
    const { locale, pathname: page } = localize(pathname);
    // Unprefixed manifest paths resolve to the default locale — pages may assume ctx.i18n exists.
    const result = await renderPage(page, localeCtx(ctx, locale ?? options.i18n?.defaultLocale));
    const entries = result
      ? [
          ...result.registry.islands.map(({ def, key, instance }) => ({ def, key, instance })),
          ...[...result.registry.stores.values()].map((instance) => ({ def: instance.def, instance })),
        ]
      : [];
    const base = buildManifest(entries, ctx);
    // App-wide route map: the agent can target pages that are NOT mounted
    // (ui_navigate) — patterns only, params stay for the model to fill.
    const routes = [
      ...Object.keys(options.routes ?? {}),
      ...(router?.routes.map((route) => route.pattern) ?? []),
    ];

    return { ...base, routes, tools: [...base.tools, ...apiManifestTools(apiTools, ctx)] };
  };

  /** Agent + `confirm`: register a pending proposal for a human instead of running the tool. */
  const proposeApi = (tool: ApiTool, input: unknown, ctx: Ctx) => {
    const parsed = tool.input ? assertValidInput(tool, input) : input;
    const id = proposalId('api');

    evictOldestProposal(proposals);
    proposals.set(id, { id, tool: tool.name, input: parsed, execute: () => invokeApi(tool, parsed, ctx, 'human', options.onAudit) });
    // `proposed`, not `ok` — nothing ran yet, and an audit trail that records an
    // unapproved proposal as a success is worse than no trail at all.
    options.onAudit?.(apiAuditEntry(tool, 'agent', 'confirm', ctx, { input: parsed, ok: true, proposed: true }));

    return { status: 'proposal' as const, id, tool: tool.name, input: parsed };
  };

  /**
   * The seam every agent-side caller shares: the copilot loop and the hosted MCP
   * endpoint. Origin is always `agent` here, so `confirm` must gate — the HTTP
   * path is not the only door a model knocks on.
   */
  const invokeTool = async (name: string, input: unknown, ctx: Ctx): Promise<unknown> => {
    const tool = apiTools.find((candidate) => `api.${candidate.name}` === name || candidate.name === name);

    if (!tool) throw Object.assign(new Error(`Unknown api tool "${name}"`), { code: 'invalid_input' });
    if (resolveApiGuard(tool, ctx) === 'confirm') return proposeApi(tool, input, ctx);

    return invokeApi(tool, input, ctx, 'agent', options.onAudit);
  };

  const handleApi = async (req: Request, name: string): Promise<Response> => {
    const tool = apiTools.find((candidate) => candidate.name === name);

    if (!tool) return json({ ok: false, error: `Unknown api "${name}"` }, 404);
    const origin = req.headers.get('x-janux-origin') === 'agent' ? 'agent' : 'human';
    const input = await req.json().catch(() => ({}));
    const ctx = await ctxWithAgent(req);

    if (origin === 'agent' && agentAuth?.policy === 'require' && !(ctx.agent as AgentIdentity | undefined)?.verified) {
      return json({ ok: false, error: 'agent_required' }, 401);
    }

    try {
      if (origin === 'agent' && resolveApiGuard(tool, ctx) === 'confirm') {
        return json({ ok: true, result: proposeApi(tool, input, ctx) });
      }

      return json({ ok: true, result: await invokeApi(tool, input, ctx, origin, options.onAudit) });
    } catch (error) {
      return json({ ok: false, error: String(error) }, errorStatus(error));
    }
  };

  const handleApprove = async (req: Request): Promise<Response> => {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    const proposal = id ? proposals.get(id) : undefined;

    if (!proposal) return json({ ok: false, error: 'unknown proposal' }, 404);
    proposals.delete(proposal.id);

    return json({ ok: true, result: await proposal.execute() });
  };

  /** The client payload ships only what the page's islands consume: SSR-recorded keys + declared `i18nKeys`. */
  const shellI18n = (locale: string | undefined, result: RenderSummary): ShellI18n | undefined => {
    const config = options.i18n;

    if (!locale || !config) return undefined;
    const islands = result.registry.islands;
    const declared = islands.flatMap(({ def }) => def.i18nKeys ?? []);
    const messages = selectMessages(config.messages?.[locale] ?? {}, result.i18nKeys, declared, config.keySeparator);
    const payload =
      islands.length > 0
        ? {
            locale,
            locales: config.locales,
            defaultLocale: config.defaultLocale,
            messages,
            keySeparator: config.keySeparator,
            allowEmptyStrings: config.allowEmptyStrings,
            interpolation: config.interpolation && {
              prefix: config.interpolation.prefix,
              suffix: config.interpolation.suffix,
            },
          }
        : undefined;

    return { locale, dir: localeDir(locale), payload };
  };

  /** Markdown projection of one page — `.md` suffix and content-MCP resources. */
  const readPageMarkdown = async (pathname: string, baseCtx: Ctx): Promise<string | undefined> => {
    const { locale, pathname: page } = localize(pathname);
    const result = await renderPage(page, localeCtx(baseCtx, locale ?? options.i18n?.defaultLocale));

    if (!result) return undefined;

    return pageMarkdown(result.meta?.title ?? options.title, result.html);
  };

  const mcpEndpoint = createMcpEndpoint({
    serverName: options.title ?? 'janux-app',
    tools: apiTools,
    invoke: (tool, input, ctx) => invokeTool(tool, input, ctx),
    listPages,
    readPage: readPageMarkdown,
    auth: options.mcpAuth,
  });

  const handlePage = async (req: Request, pathname: string): Promise<Response> => {
    const { locale, pathname: page } = localize(pathname);
    /*
     * A client navigation is being diffed into a document that already has the
     * app's CSS — and the client keeps its live <style> nodes across the swap
     * (keepRuntimeStyles). Re-sending inlined CSS puts it in front of the
     * content instead: 27 KB of the docs site's 95 KB page, which is what the
     * streaming diff then spends its first chunks on.
     */
    const navigating = req.headers.get(NAVIGATION_HEADER) === '1';

    if (options.i18n && !locale) {
      const { search } = new URL(req.url);
      const location = `/${detectLocale(req, options.i18n)}${pathname === '/' ? '' : pathname}${search}`;

      return new Response(null, { status: 302, headers: { location } });
    }
    const ctx = localeCtx(await resolveCtx(req), locale);
    const rendered = await renderPageStream(page, ctx);

    if (!rendered) return new Response('Not found', { status: 404 });
    /*
     * The same options build both shell parts, in two moments: the prelude
     * before the body renders (nothing in it may depend on the render — title,
     * meta and styles come from the route), the epilogue once the render is
     * done and snapshots/island names/i18n payload exist. The byte-identity
     * test in server.test.ts is what keeps this split honest.
     */
    const shellFor = (result?: RenderSummary): Omit<ShellOptions, 'html'> => {
      const islandNames = [...new Set((result?.registry.islands ?? []).map(({ def }) => def.name))];

      return {
        title: rendered.meta?.title ?? options.title,
        description: rendered.meta?.description,
        lang: options.lang,
        meta: rendered.meta,
        siteUrl,
        snapshots: result?.snapshots ?? [],
        islandNames,
        islandModules: options.islandModules,
        runtimeUrl: islandNames.length > 0 ? options.runtimeUrl : undefined,
        manifestUrl: options.staticExport ? undefined : `/_janux/manifest?path=${encodeURIComponent(pathname)}`,
        stylesheets: options.stylesheets,
        inlineStyles: navigating ? undefined : options.inlineStyles,
        favicon: options.favicon,
        i18n: result ? shellI18n(locale, result) : locale ? { locale, dir: localeDir(locale) } : undefined,
        navigation: options.navigation,
      };
    };
    const { prelude } = shellParts(shellFor());
    const body = documentStream(prelude, rendered.chunks, async () => shellParts(shellFor(await rendered.done)).epilogue);

    return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };

  const fetch = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const { pathname } = url;
    const intercepted = await options.middleware?.(req);

    if (intercepted) return intercepted;
    if (httpHandlers?.handles(pathname)) return httpHandlers.dispatch(req, await ctxWithAgent(req));
    if (pathname.startsWith('/_janux/api/')) return handleApi(req, pathname.slice('/_janux/api/'.length));
    if (pathname === '/_janux/approve') return handleApprove(req);
    if (pathname === '/_janux/reject') {
      const { id } = (await req.json().catch(() => ({}))) as { id?: string };

      return json({ ok: id ? proposals.delete(id) : false });
    }
    if (pathname === '/llms.txt' && options.llmsTxt) {
      llmsTxtBody ??= await renderLlmsTxt();

      return new Response(llmsTxtBody, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    // Both need an absolute origin to be valid at all, so `siteUrl` is the opt-in.
    if (pathname === '/sitemap.xml' && siteUrl) {
      sitemapBody ??= buildSitemap(siteUrl, await listPages());

      return new Response(sitemapBody, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
    }
    if (pathname === '/robots.txt' && siteUrl) {
      return new Response(buildRobotsTxt(siteUrl), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    if (pathname === '/_janux/manifest') {
      return json(await manifestFor(url.searchParams.get('path') ?? '/', await resolveCtx(req)));
    }
    if (pathname === '/_janux/mcp') return mcpEndpoint(req, await ctxWithAgent(req));
    if (pathname.endsWith('.md')) {
      const markdown = await readPageMarkdown(pathname.slice(0, -3) || '/', await resolveCtx(req));

      if (markdown !== undefined) {
        return new Response(markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
      }
    }
    if (pathname === '/_janux/llm' && options.agent?.handleLlm) {
      return options.agent.handleLlm(req);
    }
    if (pathname === '/_janux/agent' && options.agent) {
      const ctx = await ctxWithAgent(req);

      return options.agent.handle(req, {
        tools: apiTools,
        invoke: (tool, input) => invokeTool(tool, input, ctx),
        manifestFor: (path) => manifestFor(path, ctx),
      });
    }

    return handlePage(req, pathname);
  };

  return { fetch, apiTools, manifestFor, listPages };
}
