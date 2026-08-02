import { JxType, validate, toJsonSchema, JanuxIntentError } from 'janux';
import { isTracing, reportError, withSpan, type SpanAttributes } from 'janux/observability';
import type { AuditEntry, Ctx, Guard, GuardValue, Origin } from 'janux';

export interface ApiDef {
  description?: string;
  input?: JxType;
  output?: JxType;
  guard?: Guard;
  run: (bag: { input: any; ctx: Ctx; origin: Origin }) => unknown;
}

export interface ApiTool extends ApiDef {
  name: string;
}

const API_MARK = Symbol.for('janux.api');

export type CallableApi = ((input?: unknown) => Promise<unknown>) & ApiDef;

/**
 * Defines a server function that is simultaneously an HTTP endpoint, a typed
 * client stub and an agent tool. The returned value is directly callable on
 * the server (SSR sources, other apis); client bundles swap it for a fetch stub.
 */
export function api(def: ApiDef): CallableApi {
  if (typeof def.run !== 'function') throw new Error('Janux: api() requires run()');
  const callable = (input?: unknown) =>
    invokeApi({ ...def, name: 'inline' }, input, {}, 'human');

  return Object.assign(callable, def, { [API_MARK]: true }) as CallableApi;
}

export function isApi(value: unknown): value is ApiDef {
  return value !== null && value !== undefined && API_MARK in Object(value);
}

/** Collects api() exports from modules into namespaced tools: `{shop: mod}` → `api.shop.searchOrders`. */
export function collectApis(modules: Record<string, Record<string, unknown>>): ApiTool[] {
  return Object.entries(modules).flatMap(([moduleName, mod]) =>
    Object.entries(mod)
      .filter(([, value]) => isApi(value))
      .map(([exportName, value]) => {
        if (`${moduleName}.${exportName}`.includes('__')) {
          throw new Error(
            `Janux: api name "${moduleName}.${exportName}" may not contain "__" (reserved for tool wire names)`,
          );
        }

        return { ...(value as ApiDef), name: `${moduleName}.${exportName}` };
      }),
  );
}

const GUARD_VALUES = new Set<GuardValue>(['auto', 'confirm', 'forbidden']);

/**
 * Anything that is not one of the three answers is not an answer.
 *
 * `guard === 'forbidden'` is false for a `Promise`, so an `async` guard — which
 * the types forbid and JavaScript happily allows — used to resolve to a *pass*:
 * the gate that exists to fail closed failed open, silently, for every agent
 * call. Same for a typo'd value. Both deny here, and say so once so the author
 * finds out from a log rather than from an incident.
 */
function normalizeGuard(tool: ApiTool, value: unknown): GuardValue {
  if (GUARD_VALUES.has(value as GuardValue)) return value as GuardValue;
  console.warn(
    `Janux: the guard on "${tool.name}" answered ${JSON.stringify(String(value))} — expected "auto", "confirm" or "forbidden", so the tool is treated as forbidden`,
  );

  return 'forbidden';
}

export function resolveApiGuard(tool: ApiTool, ctx: Ctx, origin: Origin): GuardValue {
  const guard = tool.guard ?? 'auto';

  if (typeof guard !== 'function') return normalizeGuard(tool, guard);
  try {
    return normalizeGuard(tool, guard({ ctx, origin }));
  } catch {
    // Denies when it cannot decide, like the component-side `resolveGuard`.
    // Propagating took the whole api manifest down with one bad guard.
    return 'forbidden';
  }
}

function parseApiInput(tool: ApiTool, input: unknown): unknown {
  if (!tool.input) return undefined;
  const result = validate(tool.input, input ?? {});

  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');

    throw new JanuxIntentError('invalid_input', `Invalid input for "${tool.name}" — ${detail}`);
  }

  return result.value;
}

function checkOutput(tool: ApiTool, result: unknown): unknown {
  if (!tool.output) return result;
  const check = validate(tool.output, result);

  if (!check.ok) throw new Error(`Janux: api "${tool.name}" returned an invalid output`);

  return check.value;
}

/** The verified agent key id on the request context, if Web Bot Auth identified one. */
export function agentKeyId(ctx: Ctx): string | undefined {
  const agent = ctx.agent as { verified?: boolean; keyId?: string } | undefined;

  return agent?.verified ? agent.keyId : undefined;
}

export type ApiAudit = (entry: AuditEntry) => void;

/** The single place the api() audit-entry shape is assembled (used by the pipeline and the proposal path). */
export function apiAuditEntry(
  tool: ApiTool,
  origin: Origin,
  guard: GuardValue,
  ctx: Ctx,
  extra: { input: unknown; ok: boolean; error?: string; proposed?: boolean },
): AuditEntry {
  return { tool: `api.${tool.name}`, origin, guard, at: Date.now(), agent: agentKeyId(ctx), ...extra };
}

/**
 * The same six attributes the component-side pipeline emits, so one query
 * spans both halves of the agent surface: `api.` tools and mounted intents
 * share the audit trail's `tool` naming, and now its trace naming too.
 */
export function apiAttributes(tool: ApiTool, guard: GuardValue, origin: Origin, proposal?: string): SpanAttributes {
  return { 'janux.intent': `api.${tool.name}`, 'janux.guard': guard, 'janux.origin': origin, 'janux.proposal.id': proposal };
}

/** How a traced api call names itself: the approved run of a proposal is a different span from the request that proposed it. */
export interface ApiTrace {
  span?: string;
  proposal?: string;
}

/**
 * A refusal is the pipeline working. Only a tool that actually broke reaches
 * the app's `onError` — routing `invalid_input` there would drown the signal
 * in every mistyped agent call.
 */
function reportUnexpected(tool: ApiTool, origin: Origin, error: unknown): void {
  if (error instanceof JanuxIntentError) return;
  reportError(error, { phase: 'invocation', intent: `api.${tool.name}`, origin });
}

async function runApi(
  tool: ApiTool,
  guard: GuardValue,
  input: unknown,
  ctx: Ctx,
  origin: Origin,
  onAudit?: ApiAudit,
): Promise<unknown> {
  const audit = (extra: { input: unknown; ok: boolean; error?: string }) =>
    onAudit?.(apiAuditEntry(tool, origin, guard, ctx, extra));

  try {
    if (origin === 'agent' && guard === 'forbidden') {
      throw new JanuxIntentError('forbidden', `Tool "${tool.name}" is not available`);
    }
    const parsed = parseApiInput(tool, input);
    const result = checkOutput(tool, await tool.run({ input: parsed, ctx, origin }));

    audit({ input: parsed, ok: true });

    return result;
  } catch (error) {
    audit({ input, ok: false, error: String(error) });
    reportUnexpected(tool, origin, error);
    throw error;
  }
}

/** Single invocation pipeline for api() tools: guard → validate → run → validate output. */
export function invokeApi(
  tool: ApiTool,
  input: unknown,
  ctx: Ctx,
  origin: Origin,
  onAudit?: ApiAudit,
  trace: ApiTrace = {},
): Promise<unknown> {
  const guard = resolveApiGuard(tool, ctx, origin);

  // See renderIsland: reaching `withSpan` at all costs the closures below.
  if (!isTracing()) return runApi(tool, guard, input, ctx, origin, onAudit);

  return withSpan(
    trace.span ?? 'janux.api',
    () => apiAttributes(tool, guard, origin, trace.proposal),
    () => runApi(tool, guard, input, ctx, origin, onAudit),
  );
}

export function apiManifestTools(tools: ApiTool[], ctx: Ctx) {
  // Resolved once, like `toolsFor`: two resolutions let a guard that answers
  // differently per call pass the filter and then be advertised as `forbidden`.
  return tools
    .map((tool) => ({ tool, guard: resolveApiGuard(tool, ctx, 'agent') }))
    .filter(({ guard }) => guard !== 'forbidden')
    .map(({ tool, guard }) => ({
      name: `api.${tool.name}`,
      description: tool.description,
      guard,
      input: tool.input ? toJsonSchema(tool.input) : undefined,
    }));
}
