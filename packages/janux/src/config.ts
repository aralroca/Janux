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
