export type JanuxOutput = 'bun' | 'static';

/**
 * How the browser is told to get ahead of the next page.
 *
 * Speculation rules only apply to full document navigations, so they are for
 * the links Janux does NOT intercept — `[data-native]` ones once SPA navigation
 * is installed, and every link in a browser without the Navigation API. The
 * pages Janux navigates itself are warmed by `prefetch` instead, whose stream
 * feeds the diff directly.
 */
export interface SpeculationRulesConfig {
  /** When the browser should act on a rule. Default: `moderate` (hover). */
  eagerness?: 'conservative' | 'moderate' | 'eager';
  /** URL patterns to leave alone, e.g. `['/logout', '/api/*']`. */
  exclude?: string[];
}

export interface NavigationConfig {
  /** SPA navigation via the Navigation API + streamed DOM diff. Default: true. */
  spa?: boolean;
  /** Hover-warm the page a link points at, feeding its stream to the diff. Default: true. */
  prefetch?: boolean | { ttl?: number };
  /** `<script type="speculationrules">` for browser-driven navigations. Default: true. */
  speculationRules?: boolean | SpeculationRulesConfig;
}

export interface JanuxConfig {
  routesDir?: string;
  serverDir?: string;
  clientEntry?: string;
  agentModule?: string;
  storesModule?: string;
  title?: string;
  /** Document language for `<html lang>`. Defaults to `en`; i18n apps take it from the locale. */
  lang?: string;
  /**
   * Public origin, e.g. `https://janux.dev`. Resolves a route's relative
   * `image`/`canonical` into the absolute URLs Open Graph requires, and is the
   * base for `sitemap.xml` / `robots.txt`.
   */
  siteUrl?: string;
  /**
   * Inline the built stylesheet into every page instead of linking it, trading a
   * cacheable request for one less render-blocking round trip before the first
   * paint. Production only — dev keeps the link so CSS hot-reload still works.
   */
  inlineStyles?: boolean;
  llmsTxt?: { title?: string; description?: string };
  output?: JanuxOutput;
  /** SPA navigation, prefetching and speculation rules. */
  navigation?: NavigationConfig;
}

/** Identity helper for `janux.config.ts`: type-checks and autocompletes the config. */
export function defineConfig(config: JanuxConfig): JanuxConfig {
  return config;
}

/** Ids both sides agree on: the server emits these scripts, the client reads and rewrites them. */
export const SPECULATION_SCRIPT_ID = 'jx-speculation';
export const CONFIG_SCRIPT_ID = 'jx-config';

type SpeculationMatcher = { href_matches: string } | { selector_matches: string } | { not: SpeculationMatcher };

/**
 * The `<script type="speculationrules">` payload. `nativeOnly` scopes the
 * rules to links Janux hands back to the browser.
 *
 * Only `prefetch`: prerendering runs the page's scripts in a hidden tab, which
 * for an app whose islands register tools and open connections is a side effect
 * nobody asked for — and its win is redundant with the diff.
 */
export function speculationRules(
  config: boolean | SpeculationRulesConfig | undefined,
  options: { nativeOnly?: boolean } = {},
): { prefetch: [{ where: unknown; eagerness: string }] } | undefined {
  if (config === false) return undefined;
  const settings = typeof config === 'object' ? config : {};
  const scope: SpeculationMatcher = options.nativeOnly
    ? { selector_matches: 'a[data-native]' }
    : { href_matches: '/*' };
  const excludes: SpeculationMatcher[] = (settings.exclude ?? []).map((pattern) => ({
    not: { href_matches: pattern },
  }));
  const where = excludes.length > 0 ? { and: [scope, ...excludes] } : scope;

  return { prefetch: [{ where, eagerness: settings.eagerness ?? 'moderate' }] };
}
