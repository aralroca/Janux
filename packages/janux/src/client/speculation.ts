import type { SpeculationRulesConfig } from '../config';

/** Where the rules the server emitted live, so the client can replace them. */
export const SPECULATION_SCRIPT_ID = 'jx-speculation';

type Matcher = { href_matches: string } | { selector_matches: string } | { not: Matcher };

export interface SpeculationOptions {
  /** Scope the rules to links Janux hands back to the browser. */
  nativeOnly?: boolean;
}

/**
 * The `<script type="speculationrules">` payload.
 *
 * Only `prefetch`: prerendering runs the page's scripts in a hidden tab, which
 * for an app whose islands register tools and open connections is a side effect
 * nobody asked for — and its win is redundant with the diff.
 */
export function speculationRules(
  config: boolean | SpeculationRulesConfig | undefined,
  options: SpeculationOptions = {},
): { prefetch: [{ where: unknown; eagerness: string }] } | undefined {
  if (config === false) return undefined;
  const settings = typeof config === 'object' ? config : {};
  const scope: Matcher = options.nativeOnly
    ? { selector_matches: 'a[data-native]' }
    : { href_matches: '/*' };
  const excludes: Matcher[] = (settings.exclude ?? []).map((pattern) => ({ not: { href_matches: pattern } }));
  const where = excludes.length > 0 ? { and: [scope, ...excludes] } : scope;

  return { prefetch: [{ where, eagerness: settings.eagerness ?? 'moderate' }] };
}
