import type { GenericFamily } from './font/css';

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
  /**
   * Animate navigations with the View Transitions API, pairing elements that
   * share a `view-transition-name` across routes. Default: false.
   *
   * Opt-in on purpose, because it changes how the page is applied. A view
   * transition suppresses rendering until its callback resolves, so the
   * incoming page is fetched in full BEFORE the swap instead of being diffed as
   * it streams: the old page stays live and interactive for the whole download,
   * and then changes in one animated step. That is the right trade for small,
   * hover-prefetched pages and the wrong one for a page that paints
   * progressively over a second, and only the app knows which it is.
   *
   * Ignored when the browser lacks the API or the user asked for
   * `prefers-reduced-motion: reduce`.
   */
  viewTransitions?: boolean;
}

/** How route cache policies reach the CDN in front — and the shared copy the server keeps itself. */
export interface CacheConfig {
  /**
   * Header the CDN reads tags from. Default `Cache-Tag` (Cloudflare, Akamai);
   * Fastly reads `Surrogate-Key`, Netlify `Netlify-Cache-Tag`. There is no
   * standard here, which is why it is configuration and not a constant.
   */
  tagHeader?: string;
  /**
   * Keep a shared copy of `scope: 'public'` responses in the server process.
   * On by default and inert until a route declares a public policy, so it costs
   * nothing until it is asked for. Turn it off when a CDN in front already
   * holds the same bytes and the memory is better spent elsewhere.
   */
  shared?: boolean;
  /** Entries the shared cache holds before dropping the least recently used. Default 1000. */
  maxEntries?: number;
  /** Largest response body worth holding, in bytes. Default 2 MB. */
  maxBytes?: number;
}

/**
 * Bearer protection for the hosted MCP endpoint, declared as data: the CLI
 * maps it to the `mcpAuth` verifier the server takes. `tokenEnv` names the
 * env var read at boot and wins over `token` (the literal, for demos) —
 * so the config file never has to contain a production secret.
 */
export interface McpAuthConfig {
  /** Env var holding the bearer token, read at boot: `tokenEnv: 'AGENT_TOKEN'`. */
  tokenEnv?: string;
  /** Literal token — demos and tests; prefer `tokenEnv` for real deployments. */
  token?: string;
  /** Advertised in the `WWW-Authenticate` resource metadata. */
  resourceMetadataUrl?: string;
}

/** Web Bot Auth agent identity (same shape `@janux/server` takes as `agents`). */
export interface AgentsAuthConfig {
  webBotAuth: { keys: JsonWebKey[] };
  policy?: 'observe' | 'require';
}

/**
 * A font the app wants self-hosted. Declaring it is the whole API: the build
 * downloads it once, ships the subsets asked for, preloads the critical file
 * and generates a fallback face measured from the real font — see the
 * fonts guide. Nothing of this reaches the browser as JavaScript.
 */
export interface FontConfig {
  /** Google Fonts family name, e.g. `Inter`. */
  family: string;
  /** Weights to ship. Default: `[400]`. */
  weights?: number[];
  /** Default: `['normal']`. */
  styles?: ('normal' | 'italic')[];
  /** Unicode subsets to ship — the rest are never downloaded. Default: `['latin']`. */
  subsets?: string[];
  /** `font-display`. Default: `swap`, which is what the adjusted fallback makes safe. */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  /** Preload the primary subset's files. Default: true. */
  preload?: boolean;
  /** Generic family the fallback metrics are computed against. Default: `sans-serif`. */
  fallback?: GenericFamily;
  /** CSS custom property carrying the whole stack, e.g. `--font-sans`. */
  variable?: string;
}

/**
 * Strict CSP for the app's pages. `true` is the whole setup: a fresh nonce per
 * request on every inline script and style the framework emits, plus the
 * recommended `Content-Security-Policy` header. See the CSP recipe.
 */
export interface CspConfig {
  /**
   * This request's nonce. A function runs per request — the normal case. A
   * string is for an app whose proxy already minted one. Default: a fresh
   * 128-bit random nonce per request.
   */
  nonce?: string | ((req: Request) => string);
  /**
   * Send `Content-Security-Policy` on page responses. `true` uses the strict
   * policy; a function builds the app's own from the nonce. Absent ⇒ the
   * framework nonces the document and leaves the header to the app.
   */
  header?: boolean | ((nonce: string) => string);
}

/** One entry of the RSS feed — typically a content-collection entry, mapped. */
export interface FeedItem {
  /** Root-relative (`/posts/x`) or absolute URL. */
  url: string;
  title: string;
  description?: string;
  /** ISO date (`2026-07-20`), as content collections store it. Becomes `pubDate`. */
  date?: string;
  /** Author name. Emitted as `dc:creator` — RSS reserves `<author>` for an email. */
  author?: string;
}

/**
 * The RSS feed — the same idea as `llms.txt` and the `.md` projections, for
 * human readers: the site's content, machine-readable, at a well-known URL.
 */
export interface FeedConfig {
  /** Channel title. Falls back to the app `title`. */
  title?: string;
  description?: string;
  /** The entries, newest first. Called when the feed is first requested, not at boot. */
  items: () => FeedItem[] | Promise<FeedItem[]>;
}

export interface JanuxConfig {
  routesDir?: string;
  serverDir?: string;
  clientEntry?: string;
  agentModule?: string;
  storesModule?: string;
  /** Module whose default export is the app's WebSocket endpoint (path + handlers). Default: `src/ws.ts` when present. */
  websocket?: string;
  /** Bearer token for `POST /_janux/mcp` — by env var or value. GET (the landing) stays public. */
  mcpAuth?: McpAuthConfig;
  /** Web Bot Auth verification for agent-originated requests. */
  agents?: AgentsAuthConfig;
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
  /** RSS feed at `/rss.xml`. Needs `siteUrl` — a feed of relative links is invalid. */
  feed?: FeedConfig;
  output?: JanuxOutput;
  /** Fonts to self-host, subset, preload and give an adjusted fallback. */
  fonts?: FontConfig[];
  /** SPA navigation, prefetching and speculation rules. */
  navigation?: NavigationConfig;
  /** Strict CSP: nonce every inline tag, and (with `true`) send the header. */
  csp?: boolean | CspConfig;
  /** Cache-tag header and the server's own shared response cache. */
  cache?: CacheConfig;
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
