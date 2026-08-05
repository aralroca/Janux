import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ChannelDef, ServerOptions } from '@janux/server';
import { toPosix } from './app-config';

/**
 * The `src/channels/` convention: every `.ts`/`.js` file default-exports
 * `defineChannel({ receive, send })` and is named by its relative path —
 * `ops/inbox.ts` is the channel `ops/inbox`, served at
 * `/_janux/channels/ops/inbox`. Files whose name starts with `_` are shared
 * code, not channels.
 *
 * The same rule as routes, skills and schedules, for the same reason: a channel
 * that had to be declared in a config file as well would be a second place for
 * the truth to live, and the two would drift.
 */

/** `.d.ts` declares types, never a channel — and it does not start with `_`. */
const CHANNEL_FILE = /(?<!\.d)\.[tj]s$/;

type Loader = (file: string) => Promise<Record<string, unknown>>;

export function channelFiles(channelsDir: string | undefined): string[] {
  if (!channelsDir || !existsSync(channelsDir)) return [];

  return readdirSync(channelsDir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => CHANNEL_FILE.test(entry) && !toPosix(entry).split('/').some((part) => part.startsWith('_')))
    .map((entry) => join(channelsDir, entry))
    .filter((path) => statSync(path).isFile())
    .sort();
}

/** `<dir>/ops/inbox.ts` → `ops/inbox`, posix on every platform: the name is a URL. */
export function channelName(channelsDir: string, filePath: string): string {
  return toPosix(relative(channelsDir, filePath)).replace(CHANNEL_FILE, '');
}

async function loadDef(file: string, load: Loader): Promise<ChannelDef> {
  const def = (await load(file)).default as Partial<ChannelDef> | undefined;

  if (typeof def?.receive !== 'function' || typeof def.send !== 'function') {
    throw new Error(`janux: ${file} must default-export defineChannel({ receive, send })`);
  }

  return def as ChannelDef;
}

/** Discovers `src/channels/` and loads it; an app without the directory mounts nothing. */
export async function channelServerOptions(app: { channelsDir?: string }, load: Loader): Promise<ServerOptions['channels']> {
  const files = channelFiles(app.channelsDir);

  if (files.length === 0) return undefined;
  const named = await Promise.all(files.map(async (file) => [channelName(app.channelsDir!, file), await loadDef(file, load)] as const));

  return Object.fromEntries(named);
}
