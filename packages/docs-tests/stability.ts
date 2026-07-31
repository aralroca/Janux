/**
 * What Janux promises about each public export, derived rather than declared.
 *
 * The *list* is not written here: it is whatever `public-api.ts` imports and
 * `reference-pages.ts` finds documented — the same two modules the export
 * coverage test uses. Only the tiering rules live here, and only two of them
 * need a human:
 *
 *   - **internal** is derived. Two reference pages open by saying you do not
 *     need them to build an app ("Build & CLI internals", "Client runtime
 *     internals"); an export documented on those and nowhere else is plumbing.
 *   - **experimental** is declared, because nothing in the source says it.
 *     Every entry below carries the reason a release note would give, and
 *     `stability.test.ts` fails if a listed name stops being a real export.
 *   - **stable** is the default, which is the point: adding an export without
 *     thinking makes a stable promise, and that shows up in the diff.
 */
import { ENTRIES } from './public-api';
import { documentedBy } from './reference-pages';

/** Reference pages whose own first paragraph says you do not need them to build an app. */
export const INTERNAL_PAGES = new Set(['build-internals', 'client-runtime']);

export type Tier = 'stable' | 'experimental' | 'internal';

/** An API still moving, and why. `entries` covers a whole entry point, `names` individual exports. */
export type Moving = { readonly reason: string; readonly entries?: readonly string[]; readonly names?: readonly string[] };

export const EXPERIMENTAL: readonly Moving[] = [
  {
    reason:
      'React is the only foreign runtime implemented. Vue (and reverse interop — Janux inside a foreign tree) are on the roadmap, and supporting them is expected to move this surface.',
    entries: ['janux/interop'],
  },
  {
    reason:
      'Workers are emitted by a source transform because Vite cannot emit a worker chunk from a plugin. The API is small and the emit strategy is expected to change under it.',
    entries: ['janux/worker'],
  },
  {
    reason:
      'In-browser inference: the default model, the download strategy and the tool protocol are all still settling, and none of them is a decision a 0.x should freeze.',
    entries: ['@janux/agent/local'],
  },
  {
    reason:
      'Tracks the Model Context Protocol, which is itself versioned. Janux speaks two eras today and will stop speaking the older one, which is a breaking change this surface has to absorb.',
    names: ['connectMcp', 'createMcpPool'],
  },
  {
    reason: 'Web Bot Auth is an IETF draft. The signature and header format can change without Janux getting a say.',
    names: ['createAgentAuth'],
  },
];

/** Documented only by pages that disclaim themselves — plumbing, not app surface. */
function isInternal(name: string): boolean {
  const pages = documentedBy(name);

  return pages.length > 0 && pages.every((slug) => INTERNAL_PAGES.has(slug));
}

export function movingReason(entry: string, name: string): string | undefined {
  return EXPERIMENTAL.find((moving) => moving.entries?.includes(entry) || moving.names?.includes(name))?.reason;
}

/**
 * Internal wins over experimental: "you should not be calling this" is the
 * stronger statement, and it is the derived one.
 */
export function tierOf(entry: string, name: string): Tier {
  if (isInternal(name)) return 'internal';

  return movingReason(entry, name) ? 'experimental' : 'stable';
}

/** Every (entry, export) pair the contract has to cover, in the order STABILITY.md prints them. */
export function surface(): { entry: string; name: string; tier: Tier }[] {
  return Object.keys(ENTRIES).flatMap((entry) =>
    Object.keys(ENTRIES[entry]!)
      .sort()
      .map((name) => ({ entry, name, tier: tierOf(entry, name) })),
  );
}
