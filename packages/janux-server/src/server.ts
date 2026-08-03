import {
  buildManifest,
  isNotFoundError,
  renderToStream,
  renderToString,
  selectMessages,
  translateCore,
  type AuditEntry,
  type ComponentDef,
  type CspConfig,
  type Ctx,
  type I18n,
  type I18nConfig,
  type NavigationConfig,
  type PageMeta,
  type RenderResult,
} from 'janux';
import { QueryClient } from 'janux/query';
import { isTracing, reportError, withSpan, type JanuxSpan } from 'janux/observability';
import { cacheHeadersFor, policyOf, type CacheConfig, type CacheDecision } from './cache';
import { createResponseCache } from './response-cache';
import { createHttpHandlers, readBodyWithin, type HandlerModule } from './http-handlers';
import { createMcpEndpoint, type McpAuth } from './mcp';
import { pageMarkdown } from './md-projection';
import { detectLocale, localeDir, splitLocale } from './i18n-routing';
import type { ShellI18n } from './html-shell';
import { assertValidInput, errorStatus, json } from './http';
import { createProposalVault, proposalId, proposalSessionOf, sessionOf, withProposalSession, type SettleError } from './proposals';
import { apiAttributes, apiAuditEntry, apiManifestTools, collectApis, invokeApi, resolveApiGuard, type ApiTool } from './api';
import { createAgentAuth, type AgentIdentity, type AgentsConfig } from './agent-auth';
import { createFsRouter, type Route } from './router';
import {
  queryPayloadScript,
  shellEpilogue,
  shellEpilogueRest,
  shellInterlude,
  shellPrelude,
  type ShellOptions,
} from './html-shell';
import { nonceAttr, safeJson } from './html-escape';
import { buildLlmsTxt, expandPattern, type LlmsTxtConfig, type LlmsTxtTool } from './llms-txt';
import { buildRobotsTxt, buildSitemap, validSiteUrl } from './sitemap';
import { refuseCrossSite } from './csrf';
import { NONCE_HEADER, resolveCsp } from './csp';

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

/**
 * One live connection, as the handlers see it: Bun's `ServerWebSocket` in
 * production, an equivalent adapter under `janux dev`. Handlers that stick to
 * this surface (plus module state of their own) run identically in both.
 */
export interface JanuxSocket<Data = unknown> {
  data: Data;
  readyState: number;
  send(message: string | ArrayBufferLike | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

/** First-class WebSocket endpoint: Bun.serve-style handlers behind one path the framework upgrades. */
export interface WebSocketConfig<Data = any> {
  /** The pathname whose requests upgrade instead of routing, e.g. `/ws`. */
  path: string;
  /** Per-socket data attached at upgrade time; handlers read it back on `socket.data`. */
  data?: (req: Request) => Data;
  open?(socket: JanuxSocket<Data>): void | Promise<void>;
  message?(socket: JanuxSocket<Data>, message: string | Uint8Array): void | Promise<void>;
  close?(socket: JanuxSocket<Data>, code?: number, reason?: string): void | Promise<void>;
  drain?(socket: JanuxSocket<Data>): void | Promise<void>;
}

/** What `serve()` needs from the `Bun.serve` instance: the upgrade seam, nothing else. */
export interface WebSocketUpgrader {
  upgrade(req: Request, options?: { data?: unknown }): boolean;
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
  /** Self-hosted woff2 files to `<link rel=preload>`, from the app's declared fonts. */
  fontPreloads?: string[];
  /** `@font-face` rules inlined into every page: the real faces plus their metric-adjusted fallbacks. */
  fontFaces?: string;
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
   * Origins allowed to reach the invocation endpoints (`api()`, proposals, the
   * agent loop) besides the app's own — a partner front-end on another host, say.
   * Absent ⇒ same-origin only, which is what an app wants unless it deliberately
   * serves someone else's page. See `csrf.ts`.
   */
  allowedOrigins?: string[];
  /**
   * How long a parked `confirm` proposal stays approvable, in milliseconds.
   * Defaults to ten minutes: long enough for the approver to come back with a
   * coffee, short enough that a token lifted from a log or backup is dead on
   * arrival. See `proposals.ts` for the rest of the token's threat model.
   */
  proposalTtlMs?: number;
  /** First-class WebSocket endpoint — see `serve()` and the `websocket` handlers on the returned server. */
  websocket?: WebSocketConfig;
  /**
   * Prerendering for a static host: omit links to `/_janux/*`, which won't
   * exist there. Without it every static page fetches a 404 manifest.
   */
  staticExport?: boolean;
  /** SPA navigation, prefetching and speculation rules (`navigation` in the app config). */
  navigation?: NavigationConfig;
  /**
   * Strict CSP. `true` is the whole setup: a fresh nonce per request on every
   * inline script and style the framework emits, plus the recommended
   * `Content-Security-Policy` header. See `csp.ts`.
   */
  csp?: boolean | CspConfig;
  /** How route cache policies reach the CDN in front (`cache` in the app config). */
  cache?: CacheConfig;
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

interface RenderablePage {
  vnode: unknown;
  meta?: PageMeta;
}

/**
 * What a request answers with. No `page` means the app has nothing to render
 * for it — a miss with no `_404` file — and the status line travels alone. It
 * is a separate field on purpose: a page whose render is empty (`null`) is
 * still a page, and still gets its document.
 */
interface ResolvedDocument {
  status: number;
  page?: RenderablePage;
  /**
   * The matched route's declared policy. Only a 200 carries one: an error page
   * is not the page the policy described, and caching a miss under a cached
   * pattern outlives whatever caused it.
   */
  cache?: CacheDecision;
}

type ErrorPageKind = 'notFound' | 'serverError';

/**
 * Ceiling on the JSON bodies the invocation surface reads. A tool call and a
 * proposal id are small by construction, so `req.json()` — which buffers
 * whatever arrives — let an anonymous caller pick the server's memory ceiling.
 * Generous on purpose: the point is that a ceiling exists and is applied
 * BEFORE the bytes are buffered, not that it is tight.
 */
const INVOCATION_BODY_BYTES = 1024 * 1024;

/**
 * The parsed JSON body, or the 413 to answer with. Unparseable bytes still
 * degrade to `{}` — an empty input is the schema's problem to report, and that
 * is a 400 about the call rather than a 500 about the request.
 */
async function jsonBodyWithin(req: Request): Promise<unknown> {
  const bytes = await readBodyWithin(req, INVOCATION_BODY_BYTES);

  if (bytes instanceof Response) return bytes;
  try {
    // `ignoreBOM` KEEPS a leading byte-order mark instead of stripping it, so
    // the same bodies parse here as parsed through `req.json()`: adding a size
    // ceiling must not quietly widen what counts as valid JSON.
    return JSON.parse(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes));
  } catch {
    return {};
  }
}

const ERROR_PAGE_STATUS: Record<ErrorPageKind, number> = { notFound: 404, serverError: 500 };
/** The body an app with no `_404`/`_500` page answers with — the status line, in words. */
const STATUS_TEXT: Record<number, string> = { 404: 'Not found', 500: 'Internal Server Error' };

/**
 * A page that threw is the app's bug, not the visitor's: it reaches the app's
 * global `onError` even when `_500` swallows it for the visitor. The two are
 * halves of the same answer — `_500.tsx` is what the person sees, this is what
 * the operator sees.
 */
function reportRenderFailure(error: unknown, route?: string): void {
  reportError(error, { phase: 'ssr', route });
}

/**
 * A render that fails after the first flush cannot change the status line
 * anymore, so the failure is reported in-page: `janux:error` for the app (the
 * same event a failed navigation fetch dispatches) plus a console trace, and
 * the document is closed so the parser is never left mid-tag. No auto-reload:
 * a deterministic render error would just fail the same way again.
 */
function streamErrorScript(error: unknown, nonce?: string): string {
  const detail = safeJson(String(error));

  return `\n<script key="jx-stream-error"${nonceAttr(nonce)}>document.dispatchEvent(new CustomEvent("janux:error",{detail:${detail}}));console.error("Janux: render failed mid-stream",${detail})</script>\n</body>\n</html>`;
}

/**
 * prelude → body chunks → epilogue, byte-identical to the buffered
 * `htmlDocument()` (see shellPrelude/shellEpilogue). Lazily pulled, so a slow
 * reader applies backpressure to the encoder.
 */
function documentStream(
  prelude: string,
  body: AsyncGenerator<string>,
  epilogue: () => Promise<string>,
  onCancel: () => void,
  nonce?: string,
): ReadableStream<Uint8Array> {
  async function* document(): AsyncGenerator<string> {
    let sentBody = false;

    yield `${prelude}\n`;
    try {
      for await (const chunk of body) {
        // Skip empty chunks: `htmlDocument` drops empty html the same way.
        if (!chunk) continue;
        sentBody = true;
        yield chunk;
      }
      yield `${sentBody ? '\n' : ''}${await epilogue()}`;
    } catch (error) {
      yield streamErrorScript(error, nonce);
    }
  }

  // `ReadableStream.from` is not everywhere yet; this is the same adapter.
  const chunks = document();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await chunks.next();

      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    cancel() {
      // The renderer first — a generator parked on its own await cannot be
      // return()ed until it yields, which for an abandoned response is never.
      onCancel();
      chunks.return(undefined).catch(() => {});
    },
  });
}

/** The Janux fullstack server: pages, api() endpoints, manifest, proposals and the agent mount. */
export function createJanuxServer(options: ServerOptions = {}) {
  const csp = resolveCsp(options.csp, options.staticExport);
  const apiTools = collectApis(options.apis ?? {});
  const router = options.routesDir ? createFsRouter(options.routesDir, options.matchers) : undefined;
  const httpHandlers = options.httpHandlers
    ? createHttpHandlers({ ...options.httpHandlers, matchers: options.matchers, cache: options.cache })
    : undefined;
  const loadRoute = options.loadRoute ?? ((filePath: string) => import(/* @vite-ignore */ filePath));
  /**
   * Inert until a route declares `scope: 'public'` — it only ever holds what a
   * response told a shared cache it could hold, which is why it is on by
   * default without changing any existing app's behaviour.
   */
  const responseCache = options.cache?.shared === false ? undefined : createResponseCache(options.cache);
  const cached = (req: Request, produce: () => Promise<Response>): Promise<Response> =>
    responseCache ? responseCache.handle(req, produce) : produce();
  // Absent for an app with no routes dir (inline `routes`), which then has no
  // error pages either and degrades to the bare status line.
  const errorPages: Partial<Record<ErrorPageKind, string>> = router?.errorPages ?? {};
  const rootLayouts = router?.rootLayouts ?? [];
  const proposals = createProposalVault({ ttlMs: options.proposalTtlMs });

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

  /**
   * Only consulted once the cheap header checks have already failed, so a normal
   * same-origin request never pays for a signature verification.
   */
  const csrfPolicy = {
    allowedOrigins: options.allowedOrigins,
    verifiedAgent: agentAuth && (async (req: Request) => (await agentAuth.identify(req))?.verified === true),
  };

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

    // Every invocation path builds its ctx here, so this is where a `confirm`
    // proposal learns which session parked it — see `proposals.ts`.
    return withProposalSession(identity ? { ...ctx, agent: identity } : ctx, sessionOf(req));
  };

  const findRoute = (pathname: string) => {
    if (options.routes?.[pathname]) {
      return { render: options.routes[pathname]!, params: {} as Record<string, string>, layouts: [] as string[], pattern: pathname };
    }
    const match = router?.match(pathname);

    return match ? { load: match.filePath, params: match.params, layouts: match.layouts, pattern: match.pattern } : undefined;
  };

  /**
   * What `janux.route` reports: the route PATTERN, not the URL. A span per
   * order id is a cardinality bomb in any backend, and `/orders/[id]` is the
   * thing an operator actually wants a latency distribution for.
   */
  const routePattern = (pathname: string): string => findRoute(pathname)?.pattern ?? pathname;

  /** Layouts compose top-down: each `_layout` default export wraps its subtree. */
  const applyLayouts = async (vnode: unknown, layouts: string[], ctx: Ctx, params: Record<string, string>) => {
    const wrapped = [...layouts].reverse().reduce(async (childPromise, layoutPath) => {
      const child = await childPromise;
      const layoutModule = (await loadRoute(layoutPath)) as any;

      return layoutModule.default({ children: child, ctx, params });
    }, Promise.resolve(vnode));

    return wrapped;
  };

  /** Route resolution up to the renderable tree: what both render flavours share. */
  const resolvePage = async (pathname: string, ctx: Ctx) => {
    const route = findRoute(pathname);

    if (!route) return undefined;
    // A fresh per-request query client keeps SSR deterministic (no cross-request
    // cache bleed) and is the seam for future dehydrate/hydrate.
    (ctx as any).queryClient ??= new QueryClient();
    const module = 'render' in route ? undefined : ((await loadRoute(route.load)) as any);
    const render = 'render' in route ? route.render : module.default;
    const meta = await resolveMeta(module?.meta, ctx, route.params);
    const vnode = await applyLayouts(await render({ ctx, params: route.params }), route.layouts, ctx, route.params);

    return { vnode, meta, cache: { policy: policyOf(module), params: route.params, vary: [NAVIGATION_HEADER] } };
  };

  /**
   * `_404` renders inside the app's root layout — a missing page is still a page
   * of the site. `_500` renders on its own: the layout is code too, and code is
   * what just failed.
   */
  const renderErrorPage = async (filePath: string, kind: ErrorPageKind, ctx: Ctx, error: unknown): Promise<ResolvedDocument> => {
    const module = (await loadRoute(filePath)) as any;
    const vnode = await module.default({ ctx, error });
    const wrapped = kind === 'notFound' ? await applyLayouts(vnode, rootLayouts, ctx, {}) : vnode;

    return {
      status: ERROR_PAGE_STATUS[kind],
      page: { vnode: wrapped, meta: await resolveMeta(module.meta, ctx, {}) },
    };
  };

  /** No `_404`/`_500` file — or one that failed itself — degrades to the bare status line. */
  const resolveErrorPage = async (kind: ErrorPageKind, ctx: Ctx, error?: unknown): Promise<ResolvedDocument> => {
    const filePath = errorPages[kind];

    if (!filePath) return { status: ERROR_PAGE_STATUS[kind] };

    return renderErrorPage(filePath, kind, ctx, error).catch((failure) => {
      reportRenderFailure(failure, filePath);

      return { status: ERROR_PAGE_STATUS[kind] };
    });
  };

  /** The document a request answers with: the matched route, or the app's error page. */
  const resolveDocument = async (pathname: string, ctx: Ctx): Promise<ResolvedDocument> => {
    try {
      const page = await resolvePage(pathname, ctx);

      return page ? { status: 200, page, cache: page.cache } : await resolveErrorPage('notFound', ctx);
    } catch (error) {
      if (isNotFoundError(error)) return resolveErrorPage('notFound', ctx);
      reportRenderFailure(error, pathname);

      return resolveErrorPage('serverError', ctx, error);
    }
  };

  const renderOptions = (ctx: Ctx) => ({ ctx, storeDefs: options.storeDefs, foreignImport: options.foreignImport });

  const renderPageStream = (page: RenderablePage, ctx: Ctx, extra?: Parameters<typeof renderToStream>[1]) => ({
    ...renderToStream(page.vnode, { ...renderOptions(ctx), ...extra }),
    meta: page.meta,
  });

  /** For the buffered consumers, a page that called `notFound()` is not a failure: there is simply no page. */
  const resolvePageOrNone = async (pathname: string, ctx: Ctx) => {
    try {
      return await resolvePage(pathname, ctx);
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  };

  /**
   * Buffered render for consumers that need the whole page at once (manifest,
   * markdown projections). Traced like any other render: an agent turn renders
   * the page to know which tools exist, and that cost belongs in the trace —
   * otherwise its island spans hang off nothing.
   */
  const renderPage = async (pathname: string, ctx: Ctx) => {
    const page = await resolvePageOrNone(pathname, ctx);

    if (!page) return undefined;
    const rendered = await withSpan('janux.render', () => ({ 'janux.route': routePattern(pathname) }), () =>
      renderToString(page.vnode, renderOptions(ctx)),
    );

    return { ...rendered, meta: page.meta };
  };

  type PageRender = Awaited<ReturnType<typeof renderPage>>;

  /** The manifest of a rendered page — or, without one, of the app alone: same shape, no islands. */
  const manifestOf = (result: PageRender, ctx: Ctx): unknown => {
    const entries = result
      ? [
          ...result.registry.islands.map(({ def, key, instance }) => ({ def, key, instance })),
          ...[...result.registry.stores.values()].map((instance) => ({ def: instance.def, instance })),
        ]
      : [];
    const base = buildManifest(entries, ctx);
    // App-wide route map: the agent can target pages that are NOT mounted
    // (ui_navigate) — patterns only, params stay for the model to fill.
    const routes = [...Object.keys(options.routes ?? {}), ...(router?.routes.map((route) => route.pattern) ?? [])];

    return { ...base, routes, tools: [...base.tools, ...apiManifestTools(apiTools, ctx)] };
  };

  const manifestFor = async (pathname: string, ctx: Ctx): Promise<unknown> => {
    const { locale, pathname: page } = localize(pathname);
    // Unprefixed manifest paths resolve to the default locale — pages may assume ctx.i18n exists.
    const result = await renderPage(page, localeCtx(ctx, locale ?? options.i18n?.defaultLocale));

    return manifestOf(result, ctx);
  };

  /** Agent + `confirm`: register a pending proposal for a human instead of running the tool. */
  const registerProposal = (tool: ApiTool, input: unknown, ctx: Ctx, id: string) => {
    const parsed = tool.input ? assertValidInput(tool, input) : input;
    // The approved call still CAME through the agent surface — a human only
    // authorized it. Executing as 'agent' keeps run()/guards/audit consistent
    // with the client-side approval path and with the documented origin rules.
    const execute = () => invokeApi(tool, parsed, ctx, 'agent', options.onAudit, { span: 'janux.api.execute', proposal: id });
    // The signed token goes only to the proposer; spans and audit entries carry
    // the bare id, which on its own can no longer settle anything.
    const token = proposals.park({ id, tool: tool.name, input: parsed, execute, session: proposalSessionOf(ctx) });

    // `proposed`, not `ok` — nothing ran yet, and an audit trail that records an
    // unapproved proposal as a success is worse than no trail at all.
    options.onAudit?.(apiAuditEntry(tool, 'agent', 'confirm', ctx, { input: parsed, ok: true, proposed: true }));

    return { status: 'proposal' as const, id: token, tool: tool.name, input: parsed };
  };

  /**
   * The proposal gets its own span even though nothing ran: an agent asking is
   * the event a reviewer wants to see, and the approval — if it ever comes —
   * arrives in a different request, on a different trace, linked by this id.
   */
  const proposeApi = (tool: ApiTool, input: unknown, ctx: Ctx) => {
    const id = proposalId('api');

    return withSpan(
      'janux.api',
      () => apiAttributes(tool, 'confirm', 'agent', id),
      async () => registerProposal(tool, input, ctx, id),
    );
  };

  /**
   * The seam every agent-side caller shares: the copilot loop and the hosted MCP
   * endpoint. Origin is always `agent` here, so `confirm` must gate — the HTTP
   * path is not the only door a model knocks on.
   */
  const invokeTool = async (name: string, input: unknown, ctx: Ctx): Promise<unknown> => {
    const tool = apiTools.find((candidate) => `api.${candidate.name}` === name || candidate.name === name);

    if (!tool) throw Object.assign(new Error(`Unknown api tool "${name}"`), { code: 'invalid_input' });
    if (resolveApiGuard(tool, ctx, 'agent') === 'confirm') return proposeApi(tool, input, ctx);

    return invokeApi(tool, input, ctx, 'agent', options.onAudit);
  };

  const handleApi = async (req: Request, name: string): Promise<Response> => {
    const tool = apiTools.find((candidate) => candidate.name === name);

    if (!tool) return json({ ok: false, error: `Unknown api "${name}"` }, 404);
    const origin = req.headers.get('x-janux-origin') === 'agent' ? 'agent' : 'human';
    const input = await jsonBodyWithin(req);

    if (input instanceof Response) return input;
    const ctx = await ctxWithAgent(req);

    if (origin === 'agent' && agentAuth?.policy === 'require' && !(ctx.agent as AgentIdentity | undefined)?.verified) {
      return json({ ok: false, error: 'agent_required' }, 401);
    }

    try {
      if (origin === 'agent' && resolveApiGuard(tool, ctx, origin) === 'confirm') {
        return json({ ok: true, result: await proposeApi(tool, input, ctx) });
      }

      return json({ ok: true, result: await invokeApi(tool, input, ctx, origin, options.onAudit) });
    } catch (error) {
      return json({ ok: false, error: String(error) }, errorStatus(error));
    }
  };

  /**
   * Approval is a HUMAN act: a caller identifying as an agent may not approve
   * (or reject) — otherwise the proposer could settle its own proposal with
   * the unguessable id it was just handed. Same-page JS omitting the header
   * stays out of the threat model, as documented for `origin`.
   */
  const refuseAgentSettlement = (req: Request): Response | undefined => {
    if (req.headers.get('x-janux-origin') !== 'agent') return undefined;

    return json({ ok: false, error: 'a proposal is settled by a human, not by an agent' }, 403);
  };

  /** One refusal per way a token can fail — the 403 stays vague on purpose (session vs. payload is the attacker's homework). */
  const settleRefusal = (error: SettleError): Response => {
    if (error === 'expired') return json({ ok: false, error: 'proposal expired' }, 410);
    if (error === 'invalid') return json({ ok: false, error: 'proposal token does not match this session and payload' }, 403);

    return json({ ok: false, error: 'unknown proposal' }, 404);
  };

  const handleApprove = async (req: Request): Promise<Response> => {
    const refused = refuseAgentSettlement(req);

    if (refused) return refused;
    const body = await jsonBodyWithin(req);

    if (body instanceof Response) return body;
    const { id } = body as { id?: unknown };
    const settled = proposals.approve(typeof id === 'string' ? id : '', sessionOf(req));

    if ('error' in settled) return settleRefusal(settled.error);
    const { record } = settled;
    // The approval is the human act this whole feature exists to make visible:
    // its own span, `origin: human`, wrapping the agent-origin execution.
    const result = await withSpan(
      'janux.proposal.approve',
      () => ({ 'janux.proposal.id': record.id, 'janux.intent': `api.${record.tool}`, 'janux.origin': 'human' }),
      () => record.execute(),
    );

    return json({ ok: true, result });
  };

  /**
   * The client payload ships only what the page's islands consume:
   * SSR-recorded keys + declared `i18nKeys`. Without a render result (the
   * prelude, flushed before the body renders) it is just the locale and its
   * direction — the payload only exists once the render finished.
   */
  const shellI18n = (locale: string | undefined, result?: RenderSummary): ShellI18n | undefined => {
    const config = options.i18n;

    if (!locale || !config) return undefined;
    if (!result) return { locale, dir: localeDir(locale) };
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

  /**
   * Markdown projection of one page — `.md` suffix and content-MCP resources.
   * A page that fails has no projection, and says so quietly: the document
   * surface already answered that URL with `_500` and logged the failure.
   */
  const readPageMarkdown = async (pathname: string, baseCtx: Ctx): Promise<string | undefined> => {
    const { locale, pathname: page } = localize(pathname);
    const ctx = localeCtx(baseCtx, locale ?? options.i18n?.defaultLocale);
    const result = await renderPage(page, ctx).catch((error) => {
      reportRenderFailure(error, pathname);

      return undefined;
    });

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

  const handlePage = (req: Request, pathname: string, kind?: ErrorPageKind, span?: JanuxSpan): Promise<Response> => {
    const render = () => renderDocument(req, pathname, kind);

    // Resolving the pattern costs a route match. An uninstrumented app never
    // pays for it, and the request span — opened before routing knew anything
    // — learns the route here.
    if (!isTracing()) return render();
    const route = routePattern(localize(pathname).pathname);

    span?.setAttributes({ 'janux.route': route });

    return withSpan('janux.render', () => ({ 'janux.route': route }), render);
  };

  const renderDocument = async (req: Request, pathname: string, kind?: ErrorPageKind): Promise<Response> => {
    const { locale, pathname: page } = localize(pathname);
    /*
     * A client navigation is being diffed into a document that already has the
     * app's CSS — and the client keeps its live <style> nodes across the swap
     * (keepRuntimeStyles). Re-sending inlined CSS puts it in front of the
     * content instead: 27 KB of the docs site's 95 KB page, which is what the
     * streaming diff then spends its first chunks on.
     */
    const navigating = req.headers.get(NAVIGATION_HEADER) === '1';
    // Minted once per request: the header names this nonce and so does every
    // inline tag below, which is the only way the two can agree.
    const { nonce, policy } = csp?.(req) ?? {};

    if (options.i18n && !locale) {
      const { search } = new URL(req.url);
      const location = `/${detectLocale(req, options.i18n)}${pathname === '/' ? '' : pathname}${search}`;

      return new Response(null, { status: 302, headers: { location } });
    }
    const ctx = localeCtx(await resolveCtx(req), locale);
    /*
     * Pages with pending suspense boundaries get the shell in three parts
     * instead of two: an interlude (runtime + snapshots-so-far) goes out the
     * moment the page's own HTML is complete, so the page is interactive while
     * the boundary chunks stream; the tail then carries only what the
     * interlude could not know (i18n keys and boundary snapshots).
     */
    const interludeUris = new Set<string>();
    /** Query entries already sent, so each chunk only carries what the last could not. */
    const sentQueries = new Set<string>();
    let interludeSent = false;
    const document = kind ? await resolveErrorPage(kind, ctx) : await resolveDocument(page, ctx);

    if (!document.page) {
      return new Response(STATUS_TEXT[document.status], {
        status: document.status,
        headers: cacheHeadersFor({}, options.cache),
      });
    }
    const rendered = renderPageStream(document.page, ctx, {
      nonce,
      onBeforeBoundaries: (summary) => {
        const shell = shellFor(summary);

        // Suspended islands may not have registered yet (their sources are
        // still loading), but their modules are known: the map ships complete.
        shell.islandNames = [...new Set([...shell.islandNames, ...Object.keys(options.islandModules ?? {})])];
        shell.runtimeUrl = shell.islandNames.length > 0 ? options.runtimeUrl : undefined;
        summary.snapshots.forEach((snapshot) => interludeUris.add(snapshot.uri));
        interludeSent = true;

        return `${shellInterlude(shell)}\n`;
      },
    });

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
        // Same reasoning as inlineStyles: the document already carries these,
        // and a navigation response repeating them is bytes the diff discards.
        fontPreloads: navigating ? undefined : options.fontPreloads,
        fontFaces: navigating ? undefined : options.fontFaces,
        favicon: options.favicon,
        i18n: shellI18n(locale, result),
        navigation: options.navigation,
        navigating,
        nonce,
        queryScript: queryPayloadScript((ctx as any).queryClient, sentQueries, nonce),
      };
    };
    const prelude = shellPrelude(shellFor());
    const body = documentStream(
      prelude,
      rendered.chunks,
      async () => {
        const summary = await rendered.done;

        // The HTML already flushed; only the tail waits. A query the render
        // kicked off resolves into this payload instead of into a second
        // request from the browser.
        await (ctx as any).queryClient?.settle();
        const shell = shellFor(summary);

        return interludeSent ? shellEpilogueRest(shell, interludeUris) : shellEpilogue(shell);
      },
      rendered.cancel,
      nonce,
    );

    return new Response(body, {
      status: document.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        ...(nonce ? { [NONCE_HEADER]: nonce } : {}),
        ...(policy ? { 'content-security-policy': policy } : {}),
        ...cacheHeadersFor(document.cache ?? {}, options.cache),
      },
    });
  };

  /**
   * The `_404` page as a standalone document, for a host that has no server to
   * ask: `output: "static"` writes it to `404.html`. Undefined when the app has
   * no `_404` page — there is nothing to write.
   */
  const notFoundPage = async (): Promise<Response | undefined> => {
    if (!errorPages.notFound) return undefined;
    const base = options.i18n ? `/${options.i18n.defaultLocale}` : '/';

    return handlePage(new Request(`http://localhost${base}`), base, 'notFound');
  };

  const handleRequest = async (req: Request, span: JanuxSpan): Promise<Response> => {
    const url = new URL(req.url);
    const { pathname } = url;
    const intercepted = await options.middleware?.(req);

    if (intercepted) return intercepted;
    /*
     * Before routing, and once for every invocation endpoint below: api calls,
     * proposal settlement and the agent loop all reach app code carrying whatever
     * credentials the caller's browser holds, so the question "who asked?" is
     * answered in one place rather than in each handler. See csrf.ts.
     */
    const forged = await refuseCrossSite(req, pathname, csrfPolicy);

    if (forged) return forged;
    if (pathname === options.websocket?.path) {
      // Reaching the pure fetch means nobody upgraded — see serve().
      return new Response('WebSocket upgrade required', { status: 426, headers: { upgrade: 'websocket' } });
    }
    if (httpHandlers?.handles(pathname)) {
      return cached(req, async () => httpHandlers.dispatch(req, await ctxWithAgent(req)));
    }
    if (pathname.startsWith('/_janux/api/')) return handleApi(req, pathname.slice('/_janux/api/'.length));
    if (pathname === '/_janux/approve') return handleApprove(req);
    if (pathname === '/_janux/reject') {
      const refused = refuseAgentSettlement(req);

      if (refused) return refused;
      const body = await jsonBodyWithin(req);

      if (body instanceof Response) return body;
      const { id } = body as { id?: unknown };
      const settled = proposals.reject(typeof id === 'string' ? id : '', sessionOf(req));

      // A foreign session must not cancel the owner's pending decision; an
      // unknown token stays the quiet `ok: false` the client mirror expects.
      if ('error' in settled) return settled.error === 'invalid' ? settleRefusal('invalid') : json({ ok: false });

      return json({ ok: true });
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
      const ctx = await resolveCtx(req);

      // The page may fail; this request must not fail with it. The client asks
      // for the manifest of the page it just landed on — including a `_500` —
      // and an escaping error would take the response down with it.
      return json(
        await manifestFor(url.searchParams.get('path') ?? '/', ctx).catch((error) => {
          reportRenderFailure(error, url.searchParams.get('path') ?? '/');

          return manifestOf(undefined, ctx);
        }),
      );
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

    return cached(req, () => handlePage(req, pathname, undefined, span));
  };

  /**
   * The last net. `_500.tsx` catches what a page render throws; this catches
   * what escapes everything else — middleware, `ctxFor`, an endpoint — so the
   * operator hears about it instead of the process printing an unattributed
   * stack. Fail-open all the way: the visitor still gets a status line.
   */
  const dispatch = async (req: Request, span: JanuxSpan): Promise<Response> => {
    try {
      return await handleRequest(req, span);
    } catch (error) {
      reportError(error, { phase: 'invocation', route: new URL(req.url).pathname });

      return new Response(STATUS_TEXT[500], { status: 500 });
    }
  };

  const fetch = (req: Request): Promise<Response> =>
    withSpan(
      'janux.request',
      () => ({ 'http.request.method': req.method, 'janux.route': new URL(req.url).pathname }),
      (span) => dispatch(req, span),
    );

  /**
   * Drop-in `Bun.serve` fetch for the owner of the listening socket: a request
   * on `websocket.path` is upgraded (returning `undefined`, per Bun's
   * contract); everything else — failed upgrades included, they land on the
   * 426 — goes through the pure `fetch`.
   */
  const serve = (req: Request, bun?: WebSocketUpgrader): Promise<Response> | undefined => {
    const config = options.websocket;
    const matches = config && bun && new URL(req.url).pathname === config.path;

    if (matches && bun.upgrade(req, { data: config.data?.(req) })) return undefined;

    return fetch(req);
  };

  /** The handler object `Bun.serve({ websocket })` takes — Bun requires `message` even when the app has none. */
  const websocket = {
    open: options.websocket?.open,
    message: options.websocket?.message ?? ((): undefined => undefined),
    close: options.websocket?.close,
    drain: options.websocket?.drain,
  };

  return { fetch, serve, websocket, apiTools, manifestFor, listPages, notFoundPage };
}
