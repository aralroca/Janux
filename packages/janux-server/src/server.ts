import {
  buildManifest,
  renderToString,
  selectMessages,
  translateCore,
  type AuditEntry,
  type ComponentDef,
  type Ctx,
  type I18n,
  type I18nConfig,
  type PageMeta,
  type RenderResult,
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
import { htmlDocument } from './html-shell';
import { buildLlmsTxt, expandPattern, type LlmsTxtConfig, type LlmsTxtTool } from './llms-txt';
import { buildRobotsTxt, buildSitemap } from './sitemap';

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

  const renderPage = async (pathname: string, ctx: Ctx) => {
    const route = findRoute(pathname);

    if (!route) return undefined;
    // A fresh per-request query client keeps SSR deterministic (no cross-request
    // cache bleed) and is the seam for future dehydrate/hydrate.
    (ctx as any).queryClient ??= new QueryClient();
    const module = 'render' in route ? undefined : ((await loadRoute(route.load)) as any);
    const render = 'render' in route ? route.render : module.default;
    const meta = await resolveMeta(module?.meta, ctx, route.params);
    const vnode = await applyLayouts(await render({ ctx, params: route.params }), route.layouts, ctx, route.params);
    const result = await renderToString(vnode, {
      ctx,
      storeDefs: options.storeDefs,
      foreignImport: options.foreignImport,
    });

    return { ...result, meta };
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
  const shellI18n = (locale: string | undefined, result: RenderResult): ShellI18n | undefined => {
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

    if (options.i18n && !locale) {
      const { search } = new URL(req.url);
      const location = `/${detectLocale(req, options.i18n)}${pathname === '/' ? '' : pathname}${search}`;

      return new Response(null, { status: 302, headers: { location } });
    }
    const ctx = localeCtx(await resolveCtx(req), locale);
    const result = await renderPage(page, ctx);

    if (!result) return new Response('Not found', { status: 404 });
    const islandNames = [...new Set(result.registry.islands.map(({ def }) => def.name))];
    const html = htmlDocument({
      html: result.html,
      title: result.meta?.title ?? options.title,
      description: result.meta?.description,
      lang: options.lang,
      meta: result.meta,
      siteUrl: options.siteUrl,
      snapshots: result.snapshots,
      islandNames,
      islandModules: options.islandModules,
      runtimeUrl: islandNames.length > 0 ? options.runtimeUrl : undefined,
      manifestUrl: options.staticExport ? undefined : `/_janux/manifest?path=${encodeURIComponent(pathname)}`,
      stylesheets: options.stylesheets,
      inlineStyles: options.inlineStyles,
      favicon: options.favicon,
      i18n: shellI18n(locale, result),
    });

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
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
    if (pathname === '/sitemap.xml' && options.siteUrl) {
      sitemapBody ??= buildSitemap(options.siteUrl, await listPages());

      return new Response(sitemapBody, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
    }
    if (pathname === '/robots.txt' && options.siteUrl) {
      return new Response(buildRobotsTxt(options.siteUrl), {
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
