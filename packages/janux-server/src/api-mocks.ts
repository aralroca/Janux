import type { ApiDef, ApiTool, CallableApi } from './api';

/**
 * Test seam for `api()`: replaces a tool's `run` while the rest of the
 * invocation pipeline — guard, input validation, output validation, audit —
 * stays exactly as in production.
 *
 * Keyed by the `run` reference rather than the tool object because every
 * boundary that re-wraps a tool (`collectApis`, the direct callable) spreads
 * the definition and so *shares* the `run` it was created with — one
 * registration reaches all of them, registered before or after collection.
 * The string form targets a wire name (`"module.export"`), which only exists
 * at the collected boundary.
 */
const mocksByRun = new WeakMap<ApiDef['run'], ApiDef['run']>();
const mocksByName = new Map<string, ApiDef['run']>();
const registeredRuns = new Set<ApiDef['run']>();

export function mockApi(target: CallableApi | string, run: ApiDef['run']): () => void {
  if (typeof target === 'string') {
    mocksByName.set(target, run);

    return () => mocksByName.delete(target);
  }
  mocksByRun.set(target.run, run);
  registeredRuns.add(target.run);

  return () => {
    mocksByRun.delete(target.run);
    registeredRuns.delete(target.run);
  };
}

export function resetApiMocks(): void {
  registeredRuns.forEach((run) => mocksByRun.delete(run));
  registeredRuns.clear();
  mocksByName.clear();
}

/** The run the pipeline should execute for `tool`: its mock if one is registered, its own otherwise. */
export function apiRunFor(tool: ApiTool): ApiDef['run'] {
  return mocksByName.get(tool.name) ?? mocksByRun.get(tool.run) ?? tool.run;
}
