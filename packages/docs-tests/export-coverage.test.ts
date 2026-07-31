import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as core from 'janux';
import * as types from 'janux/types';
import * as server from 'janux/server';
import * as client from 'janux/client';
import * as manifest from 'janux/manifest';
import * as interop from 'janux/interop';
import * as query from 'janux/query';
import * as workerEntry from 'janux/worker';
import * as januxServer from '@janux/server';
import * as agent from '@janux/agent';
import * as content from '@janux/content';
import * as agentLocal from '@janux/agent/local';
import * as vite from '@janux/vite';
import * as cli from '@janux/cli';
import { UNDOCUMENTED } from './undocumented-exports';

/**
 * Reverse coverage: every runtime export of every public entry must be
 * mentioned by a `reference/` page or listed in the backlog
 * (undocumented-exports.ts). Type-only exports are outside this contract —
 * they are documented alongside the values that carry them.
 */

const REFERENCE_DIR = resolve(import.meta.dir, '../../apps/docs/content/reference');
const ENTRIES: Record<string, Record<string, unknown>> = {
  janux: core,
  'janux/types': types,
  'janux/server': server,
  'janux/client': client,
  'janux/manifest': manifest,
  'janux/interop': interop,
  'janux/query': query,
  'janux/worker': workerEntry,
  '@janux/server': januxServer,
  '@janux/agent': agent,
  '@janux/content': content,
  '@janux/agent/local': agentLocal,
  '@janux/vite': vite,
  '@janux/cli': cli,
};
const referenceText = readdirSync(REFERENCE_DIR)
  .map((file) => readFileSync(join(REFERENCE_DIR, file), 'utf8'))
  .join('\n');
/**
 * Only code and headings count. An English word that happens to match an
 * export ("every mutation is audited") documents nothing — a real API mention
 * lives in a signature, an example or the heading that names it.
 */
const referenceCode = [
  ...referenceText.matchAll(/```[^\n]*\n([\s\S]*?)```/g),
  ...referenceText.matchAll(/`([^`\n]+)`/g),
  ...referenceText.matchAll(/^#{1,4} (.+)$/gm),
]
  .map((match) => match[1])
  .join('\n');

function isDocumented(name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(referenceCode);
}

describe('reference docs cover the public runtime API', () => {
  it('the backlog tracks exactly the known entries', () => {
    expect(Object.keys(UNDOCUMENTED).sort()).toEqual(Object.keys(ENTRIES).sort());
  });

  for (const [entry, mod] of Object.entries(ENTRIES)) {
    const backlog = new Set(UNDOCUMENTED[entry]);

    it(`${entry}: every export is documented or in the backlog`, () => {
      const missing = Object.keys(mod).filter((name) => !isDocumented(name) && !backlog.has(name));

      expect(missing).toEqual([]);
    });

    it(`${entry}: backlog entries are real, still-undocumented exports`, () => {
      const stale = [...backlog].filter((name) => !(name in mod) || isDocumented(name));

      expect(stale).toEqual([]);
    });
  }
});
