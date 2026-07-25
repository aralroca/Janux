export type JanuxOutput = 'bun' | 'static';

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
}

/** Identity helper for `janux.config.ts`: type-checks and autocompletes the config. */
export function defineConfig(config: JanuxConfig): JanuxConfig {
  return config;
}
