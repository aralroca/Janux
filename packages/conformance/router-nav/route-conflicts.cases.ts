import { dirname, join } from 'node:path';
import { createFsRouter } from '@janux/server';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Conflicting route trees must fail at *build*, not misroute at runtime. A tree
 * like `dup/[x]/[x].tsx` declares the same param name twice: one value silently
 * overwrites the other, so the page sees half its params and nobody sees an
 * error. Next.js ("You cannot have the same slug name") and SvelteKit
 * ("duplicate params") both reject the tree when it is loaded — Janux does the
 * same from `createFsRouter`. Cases follow `next:route-conflicts` and
 * `kit:routing#duplicate-params`.
 */
const fixture = (name: string) => join(dirname(import.meta.path), '__fixtures__', name);

export const CONFLICT_CASES: ScenarioCase[] = [
  {
    id: 'conflict-duplicate-dynamic-name-throws-at-build',
    src: 'next:route-conflicts#same-slug-name',
    run: (log) => attempt(log, 'build', () => createFsRouter(fixture('invalid-dup'))),
    expected: ['build:threw:janux: duplicate param name "x" in route "/dup/[x]/[x]" — every dynamic segment needs a distinct name.'],
  },
  {
    id: 'conflict-duplicate-name-shared-with-a-rest-segment-throws',
    src: 'kit:routing#duplicate-params',
    run: (log) => attempt(log, 'build', () => createFsRouter(fixture('invalid-dup2'))),
    expected: ['build:threw:janux: duplicate param name "y" in route "/mix2/[y]/[...y]" — every dynamic segment needs a distinct name.'],
  },
  {
    id: 'conflict-distinct-names-across-segments-build-fine',
    src: 'janux',
    run: (log) => attempt(log, 'build', () => createFsRouter(fixture('decoding'))),
    expected: ['build:ok'],
  },
];
