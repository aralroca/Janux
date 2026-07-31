/**
 * The published entry points, as the runtime sees them.
 *
 * `export-coverage.test.ts` walks this map to assert every runtime export is
 * documented; the STABILITY.md generator walks the same map to decide what the
 * stability contract has to cover. One list, so the contract cannot promise
 * anything about an API the coverage test has never heard of, and a new entry
 * point cannot appear in one place and be forgotten in the other.
 */
import * as core from 'janux';
import * as types from 'janux/types';
import * as server from 'janux/server';
import * as client from 'janux/client';
import * as manifest from 'janux/manifest';
import * as interop from 'janux/interop';
import * as query from 'janux/query';
import * as observability from 'janux/observability';
import * as workerEntry from 'janux/worker';
import * as januxServer from '@janux/server';
import * as agent from '@janux/agent';
import * as content from '@janux/content';
import * as agentLocal from '@janux/agent/local';
import * as vite from '@janux/vite';
import * as cli from '@janux/cli';

export const ENTRIES: Record<string, Record<string, unknown>> = {
  janux: core,
  'janux/types': types,
  'janux/server': server,
  'janux/client': client,
  'janux/manifest': manifest,
  'janux/interop': interop,
  'janux/query': query,
  'janux/observability': observability,
  'janux/worker': workerEntry,
  '@janux/server': januxServer,
  '@janux/agent': agent,
  '@janux/content': content,
  '@janux/agent/local': agentLocal,
  '@janux/vite': vite,
  '@janux/cli': cli,
};

/** Every runtime export name of an entry point, in the order the docs read best: alphabetical. */
export function exportsOf(entry: string): string[] {
  return Object.keys(ENTRIES[entry] ?? {}).sort();
}
