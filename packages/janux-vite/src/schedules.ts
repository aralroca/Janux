import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createMemoryStorage, createScheduler, type ScheduleConfig, type ScheduleDef } from '@janux/agent';
import type { ServerOptions } from '@janux/server';
import { toPosix } from './app-config';

/**
 * The `src/schedules/` convention: every `.ts`/`.js` file default-exports
 * `defineSchedule({ cron, run })` and is named by its relative path —
 * `billing/invoice-sweep.ts` is the schedule `billing/invoice-sweep`. Files
 * whose name starts with `_` are shared code, not schedules; `_config.ts` in
 * particular chooses the store (in-memory unless it says otherwise).
 */

/** `.d.ts` declares types, never a schedule — and it does not start with `_`. */
const SCHEDULE_FILE = /(?<!\.d)\.[tj]s$/;
const CONFIG_FILES = ['_config.ts', '_config.js'];

type Loader = (file: string) => Promise<Record<string, unknown>>;

export function scheduleFiles(schedulesDir: string | undefined): string[] {
  if (!schedulesDir || !existsSync(schedulesDir)) return [];

  return readdirSync(schedulesDir, { recursive: true, encoding: 'utf8' })
    // Normalised first: a nested entry arrives with the platform's separator,
    // and `_helpers` has to be recognised on Windows too.
    .filter((entry) => SCHEDULE_FILE.test(entry) && !toPosix(entry).split('/').some((part) => part.startsWith('_')))
    .map((entry) => join(schedulesDir, entry))
    .filter((path) => statSync(path).isFile())
    .sort();
}

/** `<dir>/billing/invoice-sweep.ts` → `billing/invoice-sweep`. */
export function scheduleName(schedulesDir: string, filePath: string): string {
  // The name is the path, so it is posix on every platform: a schedule must not
  // be called `billing\invoice-sweep` on Windows and something else elsewhere.
  return toPosix(relative(schedulesDir, filePath)).replace(SCHEDULE_FILE, '');
}

export function scheduleConfigFile(schedulesDir: string | undefined): string | undefined {
  return schedulesDir ? CONFIG_FILES.map((name) => join(schedulesDir, name)).find(existsSync) : undefined;
}

async function loadDef(file: string, load: Loader): Promise<ScheduleDef> {
  const def = (await load(file)).default as Partial<ScheduleDef> | undefined;

  if (typeof def?.cron !== 'string' || typeof def.run !== 'function') {
    throw new Error(`janux: ${file} must default-export defineSchedule({ cron, run })`);
  }

  return def as ScheduleDef;
}

/**
 * Discovers `src/schedules/`, loads it, and mounts a scheduler over it. The
 * trigger is the deployment's own declaration — 'process' where something
 * persistent can hold the tick loop, 'http' where the platform's cron has to
 * POST `/_janux/schedules/tick` instead.
 */
export async function scheduleServerOptions(
  app: { schedulesDir?: string },
  load: Loader,
  trigger: 'process' | 'http' = 'process',
): Promise<ServerOptions['schedules']> {
  const files = scheduleFiles(app.schedulesDir);

  if (files.length === 0) return undefined;
  const named = await Promise.all(
    files.map(async (file) => [scheduleName(app.schedulesDir!, file), await loadDef(file, load)] as const),
  );
  const configFile = scheduleConfigFile(app.schedulesDir);
  const config = ((configFile && (await load(configFile)).default) || {}) as ScheduleConfig;
  const mount = createScheduler({
    storage: config.storage ?? createMemoryStorage(),
    schedules: Object.fromEntries(named),
    tickMs: config.tickMs,
    leaseMs: config.leaseMs,
  });

  return { mount, trigger };
}
