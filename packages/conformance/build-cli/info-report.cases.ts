import { renderInfoMarkdown } from '../../janux-cli/src/info-report';
import type { JanuxInfo } from '../../janux-cli/src/info';
import type { Case } from '../support/case';

/**
 * `janux info`, as the block somebody pastes into an issue.
 *
 * Everything about this output is about being read by a stranger triaging a
 * bug: a package that is not installed has to say so rather than be omitted (an
 * absent row reads as "unknown", and zero-config integrations are invisible in
 * the app's own source), a value that is empty has to be visibly empty, and
 * nothing may carry a path from the machine it ran on.
 */

export interface InfoCase {
  info: JanuxInfo;
  /** Lines the markdown must carry, verbatim. */
  lines: string[];
  /** Text the markdown must not carry at all. */
  never?: string[];
}

export type InfoRow = Case<InfoCase>;

const BASE: JanuxInfo = {
  versions: { janux: '0.5.0', cli: '0.5.0', bun: '1.2.0', os: 'darwin 25.5.0 (arm64)' },
  app: { name: 'shop', version: '1.0.0' },
  config: { output: 'bun', routesDir: 'src/routes' },
  adapters: [{ name: '@janux/vercel', version: '0.5.0' }],
  integrations: [{ name: '@janux/tailwind', version: '0.5.0' }],
  routes: [{ pattern: '/', file: 'src/routes/index.tsx', layouts: [] }],
};

const info = (patch: Partial<JanuxInfo>): JanuxInfo => ({ ...BASE, ...patch });

export const INFO_CASES: InfoRow[] = [
  {
    id: 'cli2-info-reports-the-versions-a-report-is-triaged-on',
    src: 'janux',
    info: BASE,
    lines: ['| janux | 0.5.0 |', '| @janux/cli | 0.5.0 |', '| bun | 1.2.0 |', '| os | darwin 25.5.0 (arm64) |'],
  },
  {
    id: 'cli2-info-says-a-missing-framework-version-is-not-installed',
    src: 'janux',
    info: info({ versions: { ...BASE.versions, janux: undefined } }),
    lines: ['| janux | not installed |'],
  },
  {
    id: 'cli2-info-names-the-app-and-its-version-on-one-row',
    src: 'janux',
    info: BASE,
    lines: ['| app | shop 1.0.0 |'],
  },
  {
    id: 'cli2-info-marks-an-app-with-no-package-json-as-empty-rather-than-blank',
    src: 'janux',
    info: info({ app: {} }),
    lines: ['| app | — |'],
  },
  {
    id: 'cli2-info-names-the-app-alone-when-it-declares-no-version',
    src: 'janux',
    info: info({ app: { name: 'shop' } }),
    lines: ['| app | shop |'],
  },
  {
    id: 'cli2-info-shows-a-resolved-config-value-that-is-absent-as-empty',
    src: 'janux',
    info: info({ config: { output: 'static', agentModule: undefined } }),
    lines: ['| output | static |', '| agentModule | — |'],
  },
  {
    id: 'cli2-info-reports-an-uninstalled-adapter-as-absent-rather-than-omitting-it',
    src: 'janux',
    info: info({ adapters: [{ name: '@janux/vercel' }] }),
    lines: ['**Adapters**', '| @janux/vercel | not installed |'],
  },
  {
    id: 'cli2-info-reports-a-zero-config-integration-that-is-installed',
    src: 'janux',
    info: BASE,
    lines: ['**Integrations**', '| @janux/tailwind | 0.5.0 |'],
  },
  {
    id: 'cli2-info-counts-the-routes-it-lists',
    src: 'janux',
    info: info({
      routes: [
        { pattern: '/', file: 'src/routes/index.tsx', layouts: [] },
        { pattern: '/orders/[id]', file: 'src/routes/orders/[id].tsx', layouts: ['src/routes/_layout.tsx'] },
      ],
    }),
    lines: ['**Routes** (2)', '| `/orders/[id]` | src/routes/orders/[id].tsx | src/routes/_layout.tsx |'],
  },
  {
    id: 'cli2-info-chains-the-layouts-outermost-first',
    src: 'janux',
    info: info({
      routes: [
        {
          pattern: '/admin/users',
          file: 'src/routes/admin/users.tsx',
          layouts: ['src/routes/_layout.tsx', 'src/routes/admin/_layout.tsx'],
        },
      ],
    }),
    lines: ['| `/admin/users` | src/routes/admin/users.tsx | src/routes/_layout.tsx → src/routes/admin/_layout.tsx |'],
  },
  {
    id: 'cli2-info-marks-a-route-with-no-layout-chain-as-empty',
    src: 'janux',
    info: BASE,
    lines: ['| `/` | src/routes/index.tsx | — |'],
  },
  {
    id: 'cli2-info-still-renders-a-route-table-for-an-app-with-no-routes',
    src: 'janux',
    info: info({ routes: [] }),
    lines: ['**Routes** (0)', '| route | module | layouts |'],
  },
  {
    id: 'cli2-info-never-carries-the-home-directory-it-ran-in',
    src: 'janux',
    info: BASE,
    lines: ['### janux info'],
    never: ['/Users/', '/home/'],
  },
];

/** Re-exported so the runner does not import the CLI twice. */
export { renderInfoMarkdown };
