import type { JxType } from '../schema';

export type GuardValue = 'auto' | 'confirm' | 'forbidden';
export type Guard = GuardValue | ((bag: { ctx: Ctx }) => GuardValue);
export type Ctx = Record<string, unknown>;
export type Origin = 'human' | 'agent';
export type Cleanup = (() => void) | undefined;

export interface RunBag {
  state: any;
  derived: Record<string, unknown>;
  sources: Record<string, SourceReader>;
  intents: Record<string, (input?: unknown) => Promise<unknown>>;
  use: Record<string, StoreHandle>;
  emit: (event: string, payload: unknown) => void;
  ctx: Ctx;
  input?: any;
  event?: any;
  signal?: AbortSignal;
}

export interface SourceReader {
  readonly value: any;
  readonly pending: boolean;
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
  guard?: Guard;
  server?: boolean;
  prefetch?: 'eager' | 'visible' | 'idle';
  ready?: (bag: RunBag) => boolean;
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
  scope?: 'app' | 'route';
  persist?: 'local' | 'none';
}
