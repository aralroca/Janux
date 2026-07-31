import {
  CONFIG_SCRIPT_ID,
  SPECULATION_SCRIPT_ID,
  speculationRules,
  type NavigationConfig,
  type PageMeta,
} from 'janux';
import type { QueryClient } from 'janux/query';
import { headTags } from './head-tags';
import { nonceAttr, safeAttr, safeJson } from './html-escape';

export interface ShellI18n {
  locale: string;
  dir: 'ltr' | 'rtl';
  /** `{ locale, messages }` client payload; only pages with islands embed it. */
  payload?: unknown;
}

export interface ShellOptions {
  html: string;
  title?: string;
  description?: string;
  /** Document language when the app has no i18n. Defaults to `en`. */
  lang?: string;
  /** The route's own `meta`: social tags, canonical, JSON-LD. */
  meta?: PageMeta;
  /** Origin the route's relative `image`/`canonical` resolve against. */
  siteUrl?: string;
  snapshots: { uri: string; state: Record<string, unknown>; sources?: Record<string, unknown> }[];
  islandNames: string[];
  islandModules?: Record<string, string>;
  runtimeUrl?: string;
  manifestUrl?: string;
  stylesheets?: string[];
  /** CSS inlined as `<style>` instead of linked: one less render-blocking round trip. */
  inlineStyles?: string[];
  /** Self-hosted woff2 files worth fetching before anything else on the page. */
  fontPreloads?: string[];
  /** `@font-face` rules — the real faces and their metric-adjusted fallbacks. */
  fontFaces?: string;
  favicon?: string;
  i18n?: ShellI18n;
  /** `navigation` from the app config: reaches the client through the shell. */
  navigation?: NavigationConfig;
  /** Query hydration payload for this chunk — see `queryPayloadScript`. Absent when the page ran no queries. */
  queryScript?: string;
  /**
   * The response answers a client navigation (`x-janux-navigation`), so the
   * speculation rules ship already narrowed to `[data-native]` links — the
   * client is provably intercepting, and matching content lets its rescope
   * pass be a no-op instead of making the browser drop its candidates.
   */
  navigating?: boolean;
  /**
   * CSP nonce for this response. Every inline script and style the shell emits
   * carries it, so an app can serve a `script-src` that names the nonce and
   * nothing else. Absent ⇒ no attribute anywhere, byte-identical to before.
   */
  nonce?: string;
}

/*
 * Every script the shell emits carries a `key`, for the navigation diff: it
 * matches children by key, and unkeyed scripts are matched by position — which
 * silently morphs one script into another (a snapshot's JSON becoming the
 * runtime's, say). Keyed, they are matched by identity or inserted.
 */
function stateScripts(snapshots: ShellOptions['snapshots'], nonce?: string): string {
  const cspAttr = nonceAttr(nonce);

  return snapshots
    .map((snapshot) => {
      const payload = safeJson({ state: snapshot.state, sources: snapshot.sources ?? {} });
      const uri = safeAttr(snapshot.uri);

      return `<script type="application/janux+state" key="state:${uri}" data-uri="${uri}"${cspAttr}>${payload}</script>`;
    })
    .join('\n');
}

/**
 * What SSR already knows about the page's queries, as a script the client
 * drains. Two things travel: `entries`, the data SSR resolved (so the client
 * renders it without asking for it again), and `expect`, the hashes of queries
 * still in flight when this chunk went out (so an observer of one of them waits
 * for the stream instead of starting the same request).
 *
 * `sent` is filled as entries are emitted, so a later chunk only carries what
 * the earlier ones could not — the same bookkeeping `shellEpilogueRest` does
 * for snapshots.
 *
 * Returns `''` when there is nothing to say, which is every page that runs no
 * queries: the mechanism costs those pages not one byte.
 */
export function queryPayloadScript(client: QueryClient | undefined, sent: Set<string>, nonce?: string): string {
  if (!client) return '';
  const entries = Object.entries(client.dehydrate()).filter(([hash]) => !sent.has(hash));
  const expected = client.inFlightHashes().filter((hash) => !sent.has(hash));

  if (entries.length === 0 && expected.length === 0) return '';
  entries.forEach(([hash]) => sent.add(hash));
  const payload = safeJson({ entries: Object.fromEntries(entries), expect: expected });

  // Self-removing so the navigation diff re-executes it on the next page
  // instead of morphing the JSON of one payload into another — the same reason
  // the suspense call scripts remove themselves.
  return `<script key="jx-query:${sent.size}"${nonceAttr(nonce)}>(window.__JANUX_QUERY__=window.__JANUX_QUERY__||[]).push(${payload});document.currentScript.remove()</script>`;
}

/**
 * Speculation rules, and the navigation config the client reads back.
 *
 * On a first load the rules cover every internal link: at parse time nothing
 * knows whether this browser intercepts navigations, and a browser that does
 * not is exactly the one that benefits. `boot()` narrows them to
 * `[data-native]` links once it takes over; navigation responses ship them
 * narrowed already. Both scripts are keyed, like everything else the shell
 * emits, so the navigation diff matches them by identity.
 */
function navigationScripts(options: Omit<ShellOptions, 'html'>): string {
  const config = options.navigation;
  const rules = speculationRules(config?.speculationRules ?? true, { nativeOnly: options.navigating });
  const cspAttr = nonceAttr(options.nonce);
  const scripts = rules
    ? [
        `<script type="speculationrules" key="${SPECULATION_SCRIPT_ID}" id="${SPECULATION_SCRIPT_ID}"${cspAttr}>${safeJson(rules)}</script>`,
      ]
    : [];

  // Only when it says something: the defaults live in the client.
  if (config && Object.keys(config).length > 0) {
    scripts.push(
      `<script type="application/janux+config" key="${CONFIG_SCRIPT_ID}" id="${CONFIG_SCRIPT_ID}"${cspAttr}>${safeJson({ navigation: config })}</script>`,
    );
  }

  return scripts.join('\n');
}

function runtimeScripts(options: Omit<ShellOptions, 'html'>): string {
  if (options.islandNames.length === 0) return '';
  const modules = Object.fromEntries(
    options.islandNames.map((name) => [name, options.islandModules?.[name] ?? '']),
  );

  const cspAttr = nonceAttr(options.nonce);

  return [
    `<script key="jx-islands"${cspAttr}>window.__JANUX_ISLANDS__=${safeJson(modules)}</script>`,
    options.runtimeUrl ? `<script type="module" key="jx-runtime" src="${options.runtimeUrl}"${cspAttr}></script>` : '',
  ].join('\n');
}

/**
 * Everything before the page's HTML. Needs nothing from the render — title,
 * meta and styles are resolved from the route before the body renders — so it
 * can be flushed as the response's first chunk.
 */
export function shellPrelude(options: Omit<ShellOptions, 'html'>): string {
  const manifestLink = options.manifestUrl
    ? `<link rel="janux-manifest" id="jx-manifest" href="${options.manifestUrl}">`
    : '';
  // Stable ids key these head links across an SPA-navigation diff so the diff
  // matches them by identity instead of by position. Without a key, a page
  // whose head has a different node count (e.g. a description meta present on
  // one page, absent on another) shifts every following node, making the diff
  // re-resolve the stylesheet link — a brief unstyled flash. See navigate.ts.
  // Inlined CSS takes the same `jx-style-N` ids as the links it replaces: the
  // diff keys on the id, not on the element name.
  const links = options.stylesheets ?? [];
  const cspAttr = nonceAttr(options.nonce);
  const styleLinks = [
    ...links.map((href, index) => `<link rel="stylesheet" id="jx-style-${index}" href="${safeAttr(href)}">`),
    // `</style` is the only sequence that can end the element early; a backslash
    // before the slash is valid inside a CSS string, where such text can appear.
    ...(options.inlineStyles ?? []).map(
      (css, index) =>
        `<style id="jx-style-${links.length + index}"${cspAttr}>${css.replace(/<\/(?=style)/gi, '<\\/')}</style>`,
    ),
  ].join('');
  // Fonts come first in the head, ahead of the stylesheet: the preload is only
  // worth having if it starts before the CSS does, and an `@font-face` the
  // browser meets after it has already painted arrives too late to stop the
  // shift the adjusted fallback exists to prevent. `crossorigin` is not optional
  // — a font is fetched anonymously, so a preload without it fetches twice.
  const fontHead = [
    ...(options.fontPreloads ?? []).map(
      (href, index) =>
        `<link rel="preload" id="jx-font-${index}" href="${safeAttr(href)}" as="font" type="font/woff2" crossorigin>`,
    ),
    ...(options.fontFaces ? [`<style id="jx-fonts"${cspAttr}>${options.fontFaces.replace(/<\/(?=style)/gi, '<\\/')}</style>`] : []),
  ].join('');
  const description = options.description
    ? `<meta name="description" id="jx-description" content="${safeAttr(options.description)}">`
    : '';
  const favicon = options.favicon
    ? `<link rel="icon" id="jx-favicon" href="${safeAttr(options.favicon)}">`
    : '';
  // Always a language: an undeclared one is a bug for assistive tech, so apps
  // without i18n get `lang` from config and fall back to English.
  const htmlAttrs = options.i18n
    ? ` lang="${safeAttr(options.i18n.locale)}" dir="${options.i18n.dir}"`
    : ` lang="${safeAttr(options.lang ?? 'en')}"`;
  // Social tags, canonical and JSON-LD go last for the same reason the
  // description does: they are the most page-dependent nodes in the head.
  const social = headTags(options.meta, {
    siteUrl: options.siteUrl,
    title: options.title,
    description: options.description,
    nonce: options.nonce,
  });

  return [
    '<!doctype html>',
    `<html${htmlAttrs}>`,
    // Order matters for SPA-navigation diffing: persistent, keyed resource
    // links (favicon, stylesheets) sit before the conditional description meta,
    // so a page that omits the description never shifts the stylesheet's
    // position — it stays put across the diff instead of being moved/re-resolved.
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeAttr(options.title ?? 'Janux app')}</title>${fontHead}${favicon}${manifestLink}${styleLinks}${description}${social}</head>`,
    '<body>',
  ].join('\n');
}

function i18nScript(options: Omit<ShellOptions, 'html'>): string {
  return options.i18n?.payload
    ? `<script type="application/janux+i18n" key="jx-i18n" id="jx-i18n"${nonceAttr(options.nonce)}>${safeJson(options.i18n.payload)}</script>`
    : '';
}

/**
 * Everything after the page's HTML: state snapshots, island runtime, i18n
 * payload — the parts that only exist once the render finished.
 */
export function shellEpilogue(options: Omit<ShellOptions, 'html'>): string {
  return [
    i18nScript(options),
    options.islandNames.length > 0 ? stateScripts(options.snapshots, options.nonce) : '',
    options.queryScript ?? '',
    navigationScripts(options),
    runtimeScripts(options),
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Mid-stream shell for a page whose suspense boundaries are still pending:
 * everything the client needs to become interactive NOW — the snapshots that
 * already exist, the navigation scripts and the runtime — emitted before the
 * trailing boundary chunks instead of after them. The kick script is a classic
 * inline `import()`: a `<script type="module">` defers until the document
 * finishes parsing, which for a streaming response means after the LAST
 * boundary resolves — exactly what this exists to avoid.
 */
export function shellInterlude(options: Omit<ShellOptions, 'html'>): string {
  const kick = options.runtimeUrl
    ? `<script key="jx-runtime-eager" id="jx-runtime-eager"${nonceAttr(options.nonce)}>import(${safeJson(options.runtimeUrl)})</script>`
    : '';

  return [
    options.islandNames.length > 0 ? stateScripts(options.snapshots, options.nonce) : '',
    options.queryScript ?? '',
    navigationScripts(options),
    runtimeScripts(options),
    kick,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The tail of a page that already shipped `shellInterlude`: only what could
 * not exist mid-stream — the i18n payload (keys recorded during boundary
 * renders too) and the boundary islands' own snapshots.
 */
export function shellEpilogueRest(options: Omit<ShellOptions, 'html'>, emittedUris: Set<string>): string {
  const rest = options.snapshots.filter((snapshot) => !emittedUris.has(snapshot.uri));

  return [
    i18nScript(options),
    options.islandNames.length > 0 ? stateScripts(rest, options.nonce) : '',
    options.queryScript ?? '',
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Both halves at once. `[prelude, html, epilogue].filter(Boolean).join('\n')`
 * is byte-identical to `htmlDocument(...)` — htmlDocument is implemented on
 * top of these parts, which is what lets the streamed response and the
 * buffered document never disagree.
 */
export function shellParts(options: Omit<ShellOptions, 'html'>): { prelude: string; epilogue: string } {
  return { prelude: shellPrelude(options), epilogue: shellEpilogue(options) };
}

/**
 * Full HTML document. Static pages (no islands) ship ZERO JavaScript:
 * no runtime script, no import map, no state — just HTML.
 */
export function htmlDocument(options: ShellOptions): string {
  const { prelude, epilogue } = shellParts(options);

  return [prelude, options.html, epilogue].filter(Boolean).join('\n');
}
