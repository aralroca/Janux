// `auditManifest`/`collectFindings` are the core of `janux verify` but are not on
// the package's export surface, so the corpus reaches for them directly.
import { auditManifest, collectFindings } from '../../janux-cli/src/verify';
import type { Case } from '../support/case';

/**
 * `janux verify` as a build gate, across a whole app rather than one manifest.
 *
 * The audit itself is one rule — an agent-reachable tool needs a description —
 * but the gate around it is where the interesting failures are: a finding
 * reported once per route floods the output, a route that fails to render must
 * not be reported as "surface OK", and a warning must never be mistaken for an
 * error, because only errors set the exit code.
 */

/** The message a finding carries, which is the part a human acts on. */
export interface AuditMessageCase {
  tools: { name: string; description?: string; guard: string }[];
  messages: string[];
}

export type AuditMessageRow = Case<AuditMessageCase>;

export const AUDIT_MESSAGE_CASES: AuditMessageRow[] = [
  {
    id: 'cli2-verify-names-the-guard-that-was-declared',
    src: 'janux',
    tools: [{ name: 'a.b', guard: 'confirm' }],
    messages: ['missing description (agent-reachable, guard "confirm")'],
  },
  {
    id: 'cli2-verify-quotes-an-auto-guard-the-same-way',
    src: 'janux',
    tools: [{ name: 'a.b', guard: 'auto' }],
    messages: ['missing description (agent-reachable, guard "auto")'],
  },
  {
    id: 'cli2-verify-reports-one-message-per-offender',
    src: 'janux',
    tools: [{ name: 'a', guard: 'auto' }, { name: 'b', guard: 'confirm' }],
    messages: [
      'missing description (agent-reachable, guard "auto")',
      'missing description (agent-reachable, guard "confirm")',
    ],
  },
  {
    id: 'cli2-verify-says-nothing-about-a-described-tool',
    src: 'janux',
    tools: [{ name: 'a', description: 'Does a thing', guard: 'confirm' }],
    messages: [],
  },
];

/**
 * One route as `collectFindings` sees it: either a manifest to audit or a
 * render that throws. `undefined` tools mean the route blew up.
 */
export interface RouteManifest {
  pattern: string;
  tools?: { name: string; description?: string; guard: string }[];
}

export interface FindingsCase {
  routes: RouteManifest[];
  /** Every finding, in order, as `<level>:<tool ?? "-">`. */
  expected: string[];
}

export type FindingsRow = Case<FindingsCase>;

export const FINDINGS_CASES: FindingsRow[] = [
  {
    id: 'cli2-verify-reports-a-tool-shared-by-two-routes-once',
    src: 'janux',
    routes: [
      { pattern: '/', tools: [{ name: 'shop.buy', guard: 'auto' }] },
      { pattern: '/cart', tools: [{ name: 'shop.buy', guard: 'auto' }] },
    ],
    expected: ['error:shop.buy'],
  },
  {
    id: 'cli2-verify-keeps-two-different-offenders-in-route-order',
    src: 'janux',
    routes: [
      { pattern: '/', tools: [{ name: 'a', guard: 'auto' }] },
      { pattern: '/cart', tools: [{ name: 'b', guard: 'auto' }] },
    ],
    expected: ['error:a', 'error:b'],
  },
  {
    id: 'cli2-verify-dedupes-by-tool-name-even-when-the-guards-differ',
    src: 'janux',
    routes: [
      { pattern: '/', tools: [{ name: 'a', guard: 'auto' }] },
      { pattern: '/cart', tools: [{ name: 'a', guard: 'confirm' }] },
    ],
    expected: ['error:a'],
  },
  {
    id: 'cli2-verify-warns-about-a-route-that-failed-to-render',
    src: 'janux',
    routes: [{ pattern: '/boom' }],
    expected: ['warn:-'],
  },
  {
    id: 'cli2-verify-audits-the-routes-that-did-render-anyway',
    src: 'janux',
    routes: [{ pattern: '/boom' }, { pattern: '/cart', tools: [{ name: 'a', guard: 'auto' }] }],
    expected: ['warn:-', 'error:a'],
  },
  {
    id: 'cli2-verify-warns-once-per-failing-route',
    src: 'janux',
    routes: [{ pattern: '/boom' }, { pattern: '/kaput' }],
    expected: ['warn:-', 'warn:-'],
  },
  {
    id: 'cli2-verify-collapses-the-same-route-failing-twice',
    src: 'janux',
    routes: [{ pattern: '/boom' }, { pattern: '/boom' }],
    expected: ['warn:-'],
  },
  {
    id: 'cli2-verify-has-nothing-to-say-about-an-app-with-no-routes',
    src: 'janux',
    routes: [],
    expected: [],
  },
  {
    id: 'cli2-verify-passes-a-route-whose-tools-are-all-described',
    src: 'janux',
    routes: [{ pattern: '/', tools: [{ name: 'a', description: 'ok', guard: 'auto' }] }],
    expected: [],
  },
  {
    id: 'cli2-verify-passes-a-route-that-exposes-no-tools-at-all',
    src: 'janux',
    routes: [{ pattern: '/', tools: [] }],
    expected: [],
  },
];

/** The message a failing route's warning must carry: the pattern, so it can be opened. */
export const FAILING_ROUTE_PATTERN = '/boom';

/** Re-exported so the runner does not import the CLI twice. */
export { auditManifest, collectFindings };
