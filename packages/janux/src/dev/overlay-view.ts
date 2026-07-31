import { escapeHtml } from '../render/html';
import type { JanuxErrorChain } from './error-channel';

/**
 * The overlay's content, as pure functions over a report.
 *
 * A stack trace says which line threw. These rows say why the invocation was
 * there at all: the route and the `_layout` chain that rendered it, the island
 * it landed in, the named behavior that ran, the guard the pipeline evaluated
 * and the origin it evaluated it for. No bundler-level overlay can reconstruct
 * that, because none of it exists outside the runtime.
 */

/** The server half of the chain, as `janux dev` answers it (see @janux/vite dev-route-info.ts). */
export interface DevRoute {
  path: string;
  pattern?: string;
  file?: string;
  layouts: string[];
  params: Record<string, string>;
}

export interface DevErrorReport {
  error: unknown;
  chain?: JanuxErrorChain;
  route?: DevRoute;
}

const NOTHING = '—';
const ARROW = '  →  ';

/** The URL, the pattern it matched, and the module that answered it. */
function routeRow(route: DevRoute | undefined): string {
  if (!route) return NOTHING;
  const matched = route.pattern ? `${ARROW}${route.pattern}` : '';
  const file = route.file ? `  ·  ${route.file}` : '';

  return `${route.path}${matched}${file}`;
}

/** `intent`/`effect`/`source` — behavior is named (invariant 3), so the row is labelled by kind. */
function behaviorRows(chain: JanuxErrorChain): [string, string][] {
  const named: [string, string][] = [[chain.kind, `${chain.component}.${chain.name}`]];
  const island: [string, string][] = chain.island ? [['island', chain.island]] : [];
  const caller: [string, string][] = chain.origin
    ? [['guard', chain.guard ?? NOTHING], ['origin', chain.origin]]
    : [];
  const input = chain.input === undefined ? [] : ([['input', JSON.stringify(chain.input)]] as [string, string][]);

  return [...island, ...named, ...caller, ...input];
}

/** The chain, top-down: where the request landed, then what ran, then who asked. */
export function chainRows(report: DevErrorReport): [string, string][] {
  const route: [string, string][] = [['route', routeRow(report.route)]];
  const layouts: [string, string][] = [['layouts', report.route?.layouts.join(ARROW) || NOTHING]];

  return [...route, ...layouts, ...(report.chain ? behaviorRows(report.chain) : [])];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function stackOf(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : '';
}

function rowMarkup([label, value]: [string, string]): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

const UNEXPLAINED =
  'This error did not come through an intent, effect or source, so Janux has no chain for it — only the stack below.';

/** The panel. `count` above 1 folds repeats into one overlay instead of stacking panels. */
export function overlayMarkup(report: DevErrorReport, count: number): string {
  const repeats = count > 1 ? `<span data-jx-count>+${count - 1} more</span>` : '';
  const note = report.chain ? '' : `<p class="note">${UNEXPLAINED}</p>`;

  return [
    `<header><span class="badge">janux dev</span><h1>${escapeHtml(messageOf(report.error))}</h1>${repeats}`,
    '<button type="button" data-jx-close aria-label="Dismiss (Esc)">✕</button></header>',
    `<h2>The Janux chain</h2><table>${chainRows(report).map(rowMarkup).join('')}</table>`,
    note,
    `<h2>Stack</h2><pre>${escapeHtml(stackOf(report.error))}</pre>`,
  ].join('');
}
