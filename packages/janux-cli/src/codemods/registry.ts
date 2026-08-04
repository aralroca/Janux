import type { Codemod } from './types';
import { eventsByName } from './transforms/events-by-name';
import { nextRoutes } from './transforms/next-routes';
import { nextMetadata } from './transforms/next-metadata';
import { nextImports } from './transforms/next-imports';
import { astroRoutes } from './transforms/astro-routes';
import { astroContent } from './transforms/astro-content';

/**
 * Every codemod Janux ships, in the order it should run.
 *
 * Order matters within a migration: the route codemod decides where a file
 * ends up, and the ones after it edit what is by then the same file's contents.
 * Across releases it matters too — a 0.5 codemod runs before a 0.7 one, because
 * that is the order the app would have met them.
 */
export const CODEMODS: Codemod[] = [eventsByName, nextRoutes, nextMetadata, nextImports, astroRoutes, astroContent];

export function codemodById(id: string): Codemod | undefined {
  return CODEMODS.find((codemod) => codemod.id === id);
}

/** `0.10.0` is after `0.9.0`: the parts are numbers, and a prerelease tag is not one of them. */
function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('-')[0]!
    .split('.')
    .map((part) => Number(part) || 0);
}

/** Negative when `left` is older, positive when it is newer, zero when they match. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  const parts = Array.from({ length }, (_, index) => (a[index] ?? 0) - (b[index] ?? 0));

  return parts.find((delta) => delta !== 0) ?? 0;
}

/**
 * The codemods an upgrade from `from` to `to` has to run: those whose release
 * lies *after* what is installed and *at or before* the target.
 *
 * `from` is excluded on purpose. An app already on 0.5 met the 0.5 break when
 * it got there, and running that codemod again would be, at best, a no-op —
 * the point of the boundary is that it does not depend on being one.
 */
export function codemodsBetween(from: string, to: string): Codemod[] {
  return CODEMODS.filter(
    (codemod) => codemod.since && compareVersions(codemod.since, from) > 0 && compareVersions(codemod.since, to) <= 0,
  );
}
