import type { JanuxInfo, PackagePresence, RouteInfo } from './info';

/**
 * The markdown `janux info` prints. GitHub renders these tables, so the output
 * is legible in an issue exactly as pasted — which is the only reason it is
 * markdown and not a pretty-printed console block.
 */

const NOTHING = '—';
const ABSENT = 'not installed';

function table(rows: [string, string][]): string {
  return ['| | |', '|---|---|', ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join('\n');
}

function versionRows(info: JanuxInfo): [string, string][] {
  return [
    ['janux', info.versions.janux ?? ABSENT],
    ['@janux/cli', info.versions.cli ?? ABSENT],
    ['bun', info.versions.bun],
    ['os', info.versions.os],
    ['app', [info.app.name, info.app.version].filter(Boolean).join(' ') || NOTHING],
  ];
}

function configRows(config: JanuxInfo['config']): [string, string][] {
  return Object.entries(config).map(([key, value]) => [key, value || NOTHING]);
}

function presenceRows(packages: PackagePresence[]): [string, string][] {
  return packages.map((entry) => [entry.name, entry.version ?? ABSENT]);
}

function routeTable(routes: RouteInfo[]): string {
  const header = ['| route | module | layouts |', '|---|---|---|'];
  const rows = routes.map(
    (route) => `| \`${route.pattern}\` | ${route.file} | ${route.layouts.join(' → ') || NOTHING} |`,
  );

  return [...header, ...rows].join('\n');
}

/** One pasteable block: versions, resolved config, what is installed, and every route. */
export function renderInfoMarkdown(info: JanuxInfo): string {
  return [
    '### janux info',
    table(versionRows(info)),
    '**Resolved config** (paths relative to the app root)',
    table(configRows(info.config)),
    '**Adapters**',
    table(presenceRows(info.adapters)),
    '**Integrations**',
    table(presenceRows(info.integrations)),
    `**Routes** (${info.routes.length})`,
    routeTable(info.routes),
  ].join('\n\n');
}
