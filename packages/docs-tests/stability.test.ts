import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stabilityDocument } from './generate-stability';
import { EXPERIMENTAL, surface, tierOf } from './stability';

/**
 * STABILITY.md is a generated view over the same public API `export-coverage.test.ts`
 * checks, so the two cannot disagree — but only while the committed file is the one
 * the generator would write. That is the assertion below.
 */

const COMMITTED = resolve(import.meta.dir, '../../STABILITY.md');
const listed = [...readFileSync(COMMITTED, 'utf8').matchAll(/`([^`\n]+)`/g)].map((match) => match[1]!);

describe('STABILITY.md', () => {
  it('is what the generator writes — regenerate with `bun run docs:stability`', () => {
    expect(readFileSync(COMMITTED, 'utf8')).toBe(stabilityDocument());
  });

  /**
   * The internal tier is derived from which pages document a name, and the
   * failure mode is silent: if that lookup ever returned nothing, every export
   * would quietly become stable — a promise nobody made.
   */
  it('derives internal from the pages that disclaim themselves, and only those', () => {
    expect(tierOf('@janux/vite', 'apiStubModule')).toBe('internal');
    expect(tierOf('@janux/server', 'createHttpHandlers')).toBe('internal');
    expect(tierOf('janux/client', 'boot')).toBe('stable');
    expect(tierOf('janux', 'component')).toBe('stable');
  });

  it('marks a declared experimental surface, whole entry point or single export', () => {
    expect(tierOf('janux/interop', 'foreign')).toBe('experimental');
    expect(tierOf('@janux/server', 'createAgentAuth')).toBe('experimental');
  });

  it('names no API that is not exported', () => {
    const real = new Set(surface().flatMap((api) => [api.name, api.entry]));
    const claimed = EXPERIMENTAL.flatMap((moving) => [...(moving.entries ?? []), ...(moving.names ?? [])]);

    expect(claimed.filter((name) => !real.has(name))).toEqual([]);
  });

  it('mentions every export by name', () => {
    const mentioned = new Set(listed);

    expect(surface().filter((api) => !mentioned.has(api.name)).map((api) => api.name)).toEqual([]);
  });
});
