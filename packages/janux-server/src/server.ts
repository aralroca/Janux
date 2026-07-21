import { buildManifest, renderToString, validate, type ComponentDef, type Ctx } from 'janux';
import { apiManifestTools, collectApis, invokeApi, resolveApiGuard, type ApiTool } from './api';
import { createFsRouter } from './router';
import { htmlDocument } from './html-shell';

export interface AgentMount {
  handle(req: Request, deps: AgentDeps): Promise<Response>;
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
  stylesheets?: string[];
  favicon?: string;
}

interface PendingApiProposal {
  id: string;
  tool: string;
  input: unknown;
  execute: () => Promise<unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const MAX_PENDING_PROPOSALS = 100;

function evictOldestProposal(proposals: Map<string, PendingApiProposal>): void {
  if (proposals.size < MAX_PENDING_PROPOSALS) return;
  const oldest = proposals.keys().next().value;

  if (oldest) proposals.delete(oldest);
}

function assertValidInput(tool: { name: string; input?: any }, input: unknown): unknown {
  const result = validate(tool.input, input ?? {});

  if (!result.ok) {
    const detail = result.errors.map((e: any) => `${e.path}: ${e.message}`).join('; ');

    throw Object.assign(new Error(`Invalid input for "${tool.name}" — ${detail}`), {
      code: 'invalid_input',
    });
  }

  return result.value;
}

function errorStatus(error: unknown): number {
  const code = (error as any)?.code;

  return code === 'forbidden' ? 403 : code === 'invalid_input' ? 400 : 500;
}

let proposalSeq = 0;

/** The Janux fullstack server: pages, api() endpoints, manifest, proposals and the agent mount. */
export function createJanuxServer(options: ServerOptions = {}) {
  const apiTools = collectApis(options.apis ?? {});
  const router = options.routesDir ? createFsRouter(options.routesDir) : undefined;
  const loadRoute = options.loadRoute ?? ((filePath: string) => import(/* @vite-ignore */ filePath));
  const proposals = new Map<string, PendingApiProposal>();

  const resolveCtx = async (req: Request): Promise<Ctx> => (await options.ctxFor?.(req)) ?? {};

  const findRoute = (pathname: string) => {
    if (options.routes?.[pathname]) {
      return { render: options.routes[pathname]!, params: {} as Record<string, string> };
    }
    const match = router?.match(pathname);

    return match ? { load: match.filePath, params: match.params } : undefined;
  };

  const renderPage = async (pathname: string, ctx: Ctx) => {
    const route = findRoute(pathname);

    if (!route) return undefined;
    const module = 'render' in route ? undefined : ((await loadRoute(route.load)) as any);
    const render = 'render' in route ? route.render : module.default;
    const rawMeta = module?.meta;
    const meta = (typeof rawMeta === 'function' ? rawMeta({ ctx, params: route.params }) : rawMeta) as
      | { title?: string; description?: string }
      | undefined;
    const vnode = await render({ ctx, params: route.params });
    const result = await renderToString(vnode, { ctx, storeDefs: options.storeDefs });

    return { ...result, meta };
  };

  const manifestFor = async (pathname: string, ctx: Ctx): Promise<unknown> => {
    const result = await renderPage(pathname, ctx);
    const entries = result
      ? [
          ...result.registry.islands.map(({ def, key, instance }) => ({ def, key, instance })),
          ...[...result.registry.stores.values()].map((instance) => ({ def: instance.def, instance })),
        ]
      : [];
    const base = buildManifest(entries, ctx);

    return { ...base, tools: [...base.tools, ...apiManifestTools(apiTools, ctx)] };
  };

  const invokeTool = async (name: string, input: unknown, ctx: Ctx): Promise<unknown> => {
    const tool = apiTools.find((candidate) => `api.${candidate.name}` === name || candidate.name === name);

    if (!tool) throw Object.assign(new Error(`Unknown api tool "${name}"`), { code: 'invalid_input' });

    return invokeApi(tool, input, ctx, 'agent');
  };

  const handleApi = async (req: Request, name: string): Promise<Response> => {
    const tool = apiTools.find((candidate) => candidate.name === name);

    if (!tool) return json({ ok: false, error: `Unknown api "${name}"` }, 404);
    const origin = req.headers.get('x-janux-origin') === 'agent' ? 'agent' : 'human';
    const input = await req.json().catch(() => ({}));
    const ctx = await resolveCtx(req);

    try {
      if (origin === 'agent' && resolveApiGuard(tool, ctx) === 'confirm') {
        const parsed = tool.input ? assertValidInput(tool, input) : input;
        const id = `prop_api_${(proposalSeq += 1)}`;

        evictOldestProposal(proposals);
        proposals.set(id, { id, tool: tool.name, input: parsed, execute: () => invokeApi(tool, parsed, ctx, 'human') });

        return json({ ok: true, result: { status: 'proposal', id, tool: tool.name, input: parsed } });
      }

      return json({ ok: true, result: await invokeApi(tool, input, ctx, origin) });
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

  const handlePage = async (req: Request, pathname: string): Promise<Response> => {
    const ctx = await resolveCtx(req);
    const result = await renderPage(pathname, ctx);

    if (!result) return new Response('Not found', { status: 404 });
    const islandNames = [...new Set(result.registry.islands.map(({ def }) => def.name))];
    const html = htmlDocument({
      html: result.html,
      title: result.meta?.title ?? options.title,
      description: result.meta?.description,
      snapshots: result.snapshots,
      islandNames,
      islandModules: options.islandModules,
      runtimeUrl: islandNames.length > 0 ? options.runtimeUrl : undefined,
      manifestUrl: `/_janux/manifest?path=${encodeURIComponent(pathname)}`,
      stylesheets: options.stylesheets,
      favicon: options.favicon,
    });

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };

  const fetch = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname.startsWith('/_janux/api/')) return handleApi(req, pathname.slice('/_janux/api/'.length));
    if (pathname === '/_janux/approve') return handleApprove(req);
    if (pathname === '/_janux/reject') {
      const { id } = (await req.json().catch(() => ({}))) as { id?: string };

      return json({ ok: id ? proposals.delete(id) : false });
    }
    if (pathname === '/_janux/manifest') {
      return json(await manifestFor(url.searchParams.get('path') ?? '/', await resolveCtx(req)));
    }
    if (pathname === '/_janux/agent' && options.agent) {
      const ctx = await resolveCtx(req);

      return options.agent.handle(req, {
        tools: apiTools,
        invoke: (tool, input) => invokeTool(tool, input, ctx),
        manifestFor: (path) => manifestFor(path, ctx),
      });
    }

    return handlePage(req, pathname);
  };

  return { fetch, apiTools, manifestFor };
}
