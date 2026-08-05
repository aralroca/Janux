import type { JxType } from '../schema';
import type { JanuxNode } from '../jsx-runtime';
import type { I18n } from '../i18n/types';

/** Structural mirror of the client's PersistConfig — defs must not import client code. */
export interface PersistLikeConfig {
  name?: string;
  partialize?: (state: Record<string, unknown>) => Record<string, unknown>;
  version?: number;
  migrate?: (persisted: Record<string, unknown>, from: number) => Record<string, unknown>;
}

export type GuardValue = 'auto' | 'confirm' | 'forbidden';
/**
 * A dynamic guard sees who is asking: `origin` is `'human'` for a DOM
 * interaction and `'agent'` for any call through the agent surface (bridge,
 * WebMCP, hosted MCP, `/_janux/api`). The canonical origin-aware guard:
 * `({ origin }) => (origin === 'agent' ? 'confirm' : 'auto')`.
 */
export type Guard = GuardValue | ((bag: { ctx: Ctx; origin: Origin }) => GuardValue);

/**
 * The agent acting on this request, as the invocation pipeline sees it.
 * `verified`/`keyId` come from Web Bot Auth (@janux/server owns them);
 * `scopes` is the app's answer to "and what may this one do?" — see
 * `grantedScopes`, which can only ever narrow the session's own grant.
 */
export interface AgentGrant {
  verified?: boolean;
  keyId?: string;
  scopes?: string[];
}

export type Ctx = {
  i18n?: I18n;
  /** What this caller's credential grants. Absent ⇒ nothing: a scoped tool is unreachable. */
  scopes?: string[];
  agent?: AgentGrant;
} & Record<string, unknown>;
export type Origin = 'human' | 'agent';
/**
 * What running this leaves behind that an undo cannot take back — money moved,
 * a message sent, a record deleted. Declaring it is what lets the pipeline
 * refuse to run it unattended off untrusted content (see `janux/taint`); it
 * changes nothing for an ordinary human or agent call.
 */
export type Effect = 'irreversible';
export type Cleanup = (() => void) | undefined;

/** What the runtime stamps on a bound intent: enough to write its delegation marker. */
export interface IntentMeta {
  component: string;
  key?: string;
  name: string;
}

/**
 * A bound, invocable intent as a view receives it — the only value an event
 * prop (`onClick`, `onSubmit`, `on<Event>`) accepts. A plain closure has no
 * name, schema or guard, so it can appear neither in the HTML marker nor on
 * the agent surface.
 */
export interface IntentRef {
  (input?: unknown): Promise<unknown>;
  $intent: IntentMeta;
  /** Input bound by `.with()`; the renderer serializes it to the control's `data-input`. */
  $input?: Record<string, unknown>;
  /**
   * Binds extra input to the control this ref is placed on:
   * `onClick={intents.add.with({ productId })}` renders
   * `data-input='{"productId":…}'` for you. Chainable; later keys win. The
   * input must be JSON-serializable, and the intent's schema still validates
   * it at invocation.
   */
  with(input: Record<string, unknown>): IntentRef;
}

export interface RunBag {
  state: any;
  derived: Record<string, unknown>;
  sources: Record<string, SourceReader>;
  intents: Record<string, IntentRef>;
  use: Record<string, StoreHandle>;
  emit: (event: string, payload: unknown) => void;
  ctx: Ctx;
  input?: any;
  event?: any;
  signal?: AbortSignal;
  /**
   * Who is driving the running code — always present. Outside an intent run
   * (view, effects, lifecycle, `on` handlers) it is `'human'`: that code runs
   * on behalf of the session's user. During an intent run it is the caller's
   * origin: `'human'` for a DOM interaction, `'agent'` for any call through
   * Janux's own agent surface. An external driver clicking real DOM
   * (Playwright, computer-use) reads as `'human'`: this is a UX/governance
   * signal, not an anti-automation mechanism.
   */
  origin: Origin;
}

export interface SourceReader {
  readonly value: any;
  /** No value to show yet — false as soon as the source holds one, refreshes included. */
  readonly pending: boolean;
  /** A query is in flight, first load or refresh. Show a hint, not a placeholder. */
  readonly refreshing: boolean;
  readonly error: unknown;
}

export interface StoreHandle {
  state: any;
  derived: Record<string, unknown>;
  intents: Record<string, (input?: unknown) => Promise<unknown>>;
}

export interface IntentDef {
  description?: string;
  input?: JxType;
  /**
   * `'form'` converts string input values to what the typed `input` schema
   * means BEFORE validating — FormData only ever submits strings. Numbers
   * parse via `Number` (a blank field stays invalid), booleans follow
   * checkbox semantics (`'on'`/`'true'` → true, absent → false), `money()`
   * parses numerically but is never scaled. Already-typed input (an agent's
   * JSON) passes through untouched, so one typed schema serves both faces —
   * and the manifest keeps announcing it.
   */
  coerce?: 'form';
  guard?: Guard;
  /**
   * `'irreversible'` when running this cannot be undone. The guard still
   * decides for ordinary callers; this is what a chain fed by untrusted
   * content is measured against, and there `auto` becomes `confirm`.
   */
  effect?: Effect;
  /**
   * Scopes the caller's credential must carry, all of them. Unlike a guard —
   * which asks whether *this origin* may proceed — a scope asks whether this
   * caller was granted the capability at all, so it binds human calls as well.
   * A context without them neither sees the intent in the manifest nor can
   * invoke it. See `grantedScopes`.
   */
  scopes?: string[];
  server?: boolean;
  prefetch?: 'eager' | 'visible' | 'idle';
  ready?: (bag: RunBag) => boolean;
  /**
   * CSS selector for the DOM this intent's effect lands on, resolved after it
   * ran (so post-run `state` is available). Rides `janux:tool-call` so a
   * feedback layer can highlight elements the intent CREATES — they mount a
   * tick later, and have no delegation marker to point at.
   */
  glowTarget?: (bag: RunBag) => string | undefined;
  run: (bag: RunBag) => unknown;
}

export interface EffectDef {
  description?: string;
  when?: (state: any) => unknown;
  debounce?: string;
  run: (bag: RunBag) => Cleanup | void | Promise<void>;
}

export interface RefreshPolicy {
  everyMs?: number;
  events: string[];
}

export interface SourceDef {
  description?: string;
  query: (bag: { ctx: Ctx }) => unknown;
  refresh?: RefreshPolicy;
  /**
   * How long the loaded value counts as fresh (`'30s'`, `'5m'`, or ms). A
   * refresh trigger — an interval tick or a bus event — that arrives inside the
   * window is skipped, so a burst of events costs one query. An explicit
   * `sources.x.refresh()` always runs: asking is not a policy decision.
   */
  staleTime?: string | number;
  /**
   * How long a stale value may still be shown while it revalidates. Past
   * `staleTime + swr` the value is withheld and the reader reports `pending`
   * again — the same arithmetic a route's `cachePolicy` and a `useQuery` use.
   * Absent means a stale value is shown indefinitely (the default).
   */
  swr?: string | number;
}

export interface LifecycleDef {
  attach?: (bag: RunBag) => void | Promise<void>;
  detach?: (bag: RunBag) => void | Promise<void>;
}

export interface ComponentDef {
  kind: 'component' | 'store';
  name: string;
  description?: string;
  state?: JxType;
  derived?: Record<string, (state: any) => unknown>;
  sources?: Record<string, SourceDef>;
  effects?: Record<string, EffectDef>;
  intents?: Record<string, IntentDef>;
  emits?: Record<string, JxType>;
  on?: Record<string, (bag: RunBag) => void>;
  lifecycle?: LifecycleDef;
  use?: Record<string, ComponentDef>;
  view?: (bag: RunBag) => unknown;
  /**
   * Streaming fallback: rendered in place while the island's sources load; the
   * real content streams later in the same response and swaps in. With no
   * `suspense`, a slow island holds back its own children (never the page).
   */
  suspense?: (bag: RunBag) => unknown;
  /**
   * Error boundary for the island's whole SSR subtree (view + static children;
   * nested islands without their own `error` bubble up to it). The thrown
   * value arrives as `bag.error`.
   */
  error?: (bag: RunBag & { error: unknown }) => unknown;
  scope?: 'app' | 'route';
  /** `'local'` uses defaults; a config object customizes key/partialize/version/migrate (localStorage-backed either way). */
  persist?: 'local' | 'none' | PersistLikeConfig;
  /** Extra i18n keys (exact or prefix strings, or RegExp) this island uses only after interaction — shipped to the client along with the keys recorded during SSR. */
  i18nKeys?: (string | RegExp)[];
}

/**
 * ComponentDef with a phantom call signature so TSX accepts `<MyIsland />` as
 * an element. The signature never exists at runtime: `component()` returns a
 * frozen plain object, and the renderer checks `typeof $t === 'function'`
 * before `isComponentDef`, so defs always take the island path.
 */
export type ComponentTag = ComponentDef & ((props?: Record<string, unknown>) => JanuxNode);
