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
  llmsTxt?: { title?: string; description?: string };
  output?: JanuxOutput;
}

/** Identity helper for `janux.config.ts`: type-checks and autocompletes the config. */
export function defineConfig(config: JanuxConfig): JanuxConfig {
  return config;
}
