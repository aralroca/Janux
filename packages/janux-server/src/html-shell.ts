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
    ? `<link rel="janux-manifest" href="${options.manifestUrl}">`
    : '';
  const styleLinks = (options.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${safeAttr(href)}">`)
    .join('');
  const description = options.description
    ? `<meta name="description" content="${safeAttr(options.description)}">`
    : '';
  const favicon = options.favicon ? `<link rel="icon" href="${safeAttr(options.favicon)}">` : '';

  return [
    '<!doctype html>',
    '<html>',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${options.title ?? 'Janux app'}</title>${description}${favicon}${manifestLink}${styleLinks}</head>`,
    '<body>',
    options.html,
    options.islandNames.length > 0 ? stateScripts(options.snapshots) : '',
    runtimeScripts(options),
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}
