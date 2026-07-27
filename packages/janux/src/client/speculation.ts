import type { NavigationConfig, SpeculationRulesConfig } from '../config';

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

let interceptedConfig: NavigationConfig | undefined;

/**
 * Narrows the rules the server emitted to the links the browser still
 * navigates itself.
 *
 * The server has to emit document-wide rules — at that point nothing knows
 * whether this browser intercepts — so this runs once at boot AND after every
 * navigation, because the incoming page brings its own wide copy and the diff
 * applies it faithfully. Rules are re-evaluated by replacing the script;
 * editing its text is not enough.
 */
export function rescopeSpeculationRules(config?: NavigationConfig): void {
  interceptedConfig = config ?? interceptedConfig;
  const existing = document.getElementById(SPECULATION_SCRIPT_ID);

  if (!existing || !interceptedConfig) return;
  const rules = speculationRules(interceptedConfig.speculationRules ?? true, { nativeOnly: true });
  const script = document.createElement('script');

  existing.remove();
  if (!rules) return;
  script.type = 'speculationrules';
  script.id = SPECULATION_SCRIPT_ID;
  script.textContent = JSON.stringify(rules);
  document.head.appendChild(script);
}
