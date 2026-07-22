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
  snapshots: { uri: string; state: Record<string, unknown>; sources?: Record<string, unknown> }[];
  islandNames: string[];
  islandModules?: Record<string, string>;
  runtimeUrl?: string;
  manifestUrl?: string;
  stylesheets?: string[];
  favicon?: string;
  i18n?: ShellI18n;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function safeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function stateScripts(snapshots: ShellOptions['snapshots']): string {
  return snapshots
    .map((snapshot) => {
      const payload = safeJson({ state: snapshot.state, sources: snapshot.sources ?? {} });

      return `<script type="application/janux+state" data-uri="${safeAttr(snapshot.uri)}">${payload}</script>`;
    })
    .join('\n');
}

function runtimeScripts(options: ShellOptions): string {
  if (options.islandNames.length === 0) return '';
  const modules = Object.fromEntries(
    options.islandNames.map((name) => [name, options.islandModules?.[name] ?? '']),
  );

  return [
    `<script>window.__JANUX_ISLANDS__=${safeJson(modules)}</script>`,
    options.runtimeUrl ? `<script type="module" src="${options.runtimeUrl}"></script>` : '',
  ].join('\n');
}

/**
 * Full HTML document. Static pages (no islands) ship ZERO JavaScript:
 * no runtime script, no import map, no state — just HTML.
 */
export function htmlDocument(options: ShellOptions): string {
  const manifestLink = options.manifestUrl
    ? `<link rel="janux-manifest" id="jx-manifest" href="${options.manifestUrl}">`
    : '';
  // Stable ids key these head links across an SPA-navigation diff so the diff
  // matches them by identity instead of by position. Without a key, a page
  // whose head has a different node count (e.g. a description meta present on
  // one page, absent on another) shifts every following node, making the diff
  // re-resolve the stylesheet link — a brief unstyled flash. See navigate.ts.
  const styleLinks = (options.stylesheets ?? [])
    .map((href, index) => `<link rel="stylesheet" id="jx-style-${index}" href="${safeAttr(href)}">`)
    .join('');
  const description = options.description
    ? `<meta name="description" id="jx-description" content="${safeAttr(options.description)}">`
    : '';
  const favicon = options.favicon
    ? `<link rel="icon" id="jx-favicon" href="${safeAttr(options.favicon)}">`
    : '';

  const htmlAttrs = options.i18n ? ` lang="${safeAttr(options.i18n.locale)}" dir="${options.i18n.dir}"` : '';
  const i18nScript = options.i18n?.payload
    ? `<script type="application/janux+i18n" id="jx-i18n">${safeJson(options.i18n.payload)}</script>`
    : '';

  return [
    '<!doctype html>',
    `<html${htmlAttrs}>`,
    // Order matters for SPA-navigation diffing: persistent, keyed resource
    // links (favicon, stylesheets) sit before the conditional description meta,
    // so a page that omits the description never shifts the stylesheet's
    // position — it stays put across the diff instead of being moved/re-resolved.
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeAttr(options.title ?? 'Janux app')}</title>${favicon}${manifestLink}${styleLinks}${description}</head>`,
    '<body>',
    options.html,
    i18nScript,
    options.islandNames.length > 0 ? stateScripts(options.snapshots) : '',
    runtimeScripts(options),
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}
