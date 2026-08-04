import { escapeHtml } from '../render/html';
import type { AuditEntry } from '../runtime/intents';
import type { DevtoolsTree, DiffRow, IslandNode, SourceRow } from './devtools-data';
import { statusOf } from './devtools-data';

/**
 * The devtools panel content, as pure functions over a model. Every string an
 * app could have written — state, errors, tool names — goes through
 * `escapeHtml`: the panel renders data the page's own islands produced.
 */

export type DevtoolsTab = 'islands' | 'timeline' | 'manifest' | 'webmcp' | 'proposals';

export interface SelectedIsland {
  uri: string;
  state: string;
  schema?: string;
  sync: string;
  sources: SourceRow[];
}

export interface ProposalRow {
  id: string;
  tool: string;
  input: string;
  rows?: DiffRow[];
}

export interface WebMCPView {
  native: boolean;
  tools: { name: string; description?: string }[];
}

export interface DevtoolsModel {
  open: boolean;
  tab: DevtoolsTab;
  tree: DevtoolsTree;
  selected?: SelectedIsland;
  timeline: AuditEntry[];
  manifest?: string;
  webmcp: WebMCPView;
  proposals: ProposalRow[];
}

const TABS: [DevtoolsTab, string][] = [
  ['islands', 'Islands'],
  ['timeline', 'Timeline'],
  ['manifest', 'Manifest'],
  ['webmcp', 'WebMCP'],
  ['proposals', 'Proposals'],
];

export const LAUNCHER = '<button type="button" data-jxdt-toggle aria-label="Janux DevTools (Alt+Shift+J)">◈ janux</button>';

const empty = (message: string): string => `<p class="empty">${escapeHtml(message)}</p>`;

function tabMarkup(active: DevtoolsTab, [tab, label]: [DevtoolsTab, string]): string {
  const selected = tab === active;

  return [
    `<button type="button" data-jxdt-tab="${tab}" role="tab" aria-selected="${selected}"`,
    ` tabindex="${selected ? 0 : -1}">${label}</button>`,
  ].join('');
}

function nodeMarkup(node: IslandNode, selected?: SelectedIsland): string {
  const current = node.uri === selected?.uri ? ' aria-current="true"' : '';
  const children = node.children.length ? `<ul>${node.children.map((child) => nodeMarkup(child, selected)).join('')}</ul>` : '';
  const label = `${escapeHtml(node.name)}<small>#${escapeHtml(node.key)}</small><em>${escapeHtml(node.sync)}</em>`;

  return `<li><button type="button" data-jxdt-node="${escapeHtml(node.id)}"${current}>${label}</button>${children}</li>`;
}

function sourceMarkup(row: SourceRow): string {
  const flags = [row.pending && 'pending', row.refreshing && 'refreshing'].filter(Boolean).join(' ') || 'ready';
  const failure = row.error ? ` · ${escapeHtml(row.error)}` : '';

  return `<li><code>${escapeHtml(row.name)}</code> ${flags}${failure}</li>`;
}

/** The instance, as `resource()` projects it: schema-typed JSON shown verbatim. */
function selectedMarkup(selected: SelectedIsland | undefined): string {
  if (!selected) return empty('Select an island to inspect its state.');
  const sources = selected.sources.length ? `<h3>Sources</h3><ul>${selected.sources.map(sourceMarkup).join('')}</ul>` : '';

  return [
    `<h2><code>${escapeHtml(selected.uri)}</code> <em>${escapeHtml(selected.sync)}</em></h2>`,
    `<h3>State</h3><pre>${escapeHtml(selected.state)}</pre>`,
    sources,
    selected.schema ? `<details><summary>Schema</summary><pre>${escapeHtml(selected.schema)}</pre></details>` : '',
  ].join('');
}

function islandsMarkup(model: DevtoolsModel): string {
  const { islands, stores } = model.tree;
  const trees = [...islands, ...stores];
  const list = trees.length ? `<ul class="tree">${trees.map((node) => nodeMarkup(node, model.selected)).join('')}</ul>` : empty('No islands mounted yet.');

  return `<div class="split"><nav aria-label="Mounted islands and stores">${list}</nav><article>${selectedMarkup(model.selected)}</article></div>`;
}

function timelineRow(entry: AuditEntry): string {
  const status = statusOf(entry);
  const failure = entry.error ? ` title="${escapeHtml(entry.error)}"` : '';
  const cells = [entry.tool, entry.origin, String(entry.guard), status + (entry.error ? ` · ${entry.error}` : '')];

  return `<tr data-jxdt-status="${status}"${failure}>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`;
}

/** Newest first: the intent just dispatched is the one being debugged. */
function timelineMarkup(entries: AuditEntry[]): string {
  if (!entries.length) return empty('No intents dispatched yet. Interact with the page, or call a tool through window.janux.');
  const rows = [...entries].reverse().map(timelineRow).join('');

  return `<table><thead><tr><th>tool</th><th>origin</th><th>guard</th><th>outcome</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function manifestMarkup(manifest: string | undefined): string {
  const body = manifest === undefined ? empty('Manifest not loaded yet.') : `<pre>${escapeHtml(manifest)}</pre>`;

  return `<button type="button" data-jxdt-refresh>Reload /_janux/manifest</button>${body}`;
}

function webmcpMarkup(view: WebMCPView): string {
  const registry = `<p>Registry: <strong>${view.native ? 'native document.modelContext' : 'polyfilled'}</strong></p>`;
  const rows = view.tools.map((tool) => `<li><code>${escapeHtml(tool.name)}</code> ${escapeHtml(tool.description ?? '')}</li>`);

  return registry + (rows.length ? `<ul>${rows.join('')}</ul>` : empty('No tools registered.'));
}

function diffRowMarkup(row: DiffRow): string {
  const mark = row.changed ? ' data-jxdt-diff-changed' : '';
  const cell = (value: string | undefined): string => (value === undefined ? '<td class="gone">—</td>' : `<td>${escapeHtml(value)}</td>`);

  return `<tr${mark}><th>${escapeHtml(row.key)}</th>${cell(row.before)}${cell(row.after)}</tr>`;
}

function proposalMarkup(proposal: ProposalRow): string {
  const diff = proposal.rows
    ? `<table><thead><tr><th></th><th>before</th><th>after</th></tr></thead><tbody>${proposal.rows.map(diffRowMarkup).join('')}</tbody></table>`
    : empty('No shadow-run diff (server-backed or async intent) — review the input.');

  return [
    `<article><h2><code>${escapeHtml(proposal.tool)}</code> <small>${escapeHtml(proposal.id)}</small></h2>`,
    `<h3>Input</h3><pre>${escapeHtml(proposal.input)}</pre>${diff}</article>`,
  ].join('');
}

function proposalsMarkup(proposals: ProposalRow[]): string {
  return proposals.length ? proposals.map(proposalMarkup).join('') : empty('No pending proposals.');
}

function contentMarkup(model: DevtoolsModel): string {
  if (model.tab === 'islands') return islandsMarkup(model);
  if (model.tab === 'timeline') return timelineMarkup(model.timeline);
  if (model.tab === 'manifest') return manifestMarkup(model.manifest);
  if (model.tab === 'webmcp') return webmcpMarkup(model.webmcp);

  return proposalsMarkup(model.proposals);
}

/** The whole shadow body: the launcher alone while closed, the panel alone while open. */
export function devtoolsMarkup(model: DevtoolsModel): string {
  if (!model.open) return LAUNCHER;
  const tabs = TABS.map((tab) => tabMarkup(model.tab, tab)).join('');

  return [
    '<section aria-label="Janux DevTools">',
    `<header><div role="tablist" aria-label="DevTools views">${tabs}</div>`,
    '<button type="button" data-jxdt-close aria-label="Close (Esc)">✕</button></header>',
    `<div class="content" role="tabpanel" aria-label="${model.tab}">${contentMarkup(model)}</div>`,
    '</section>',
  ].join('');
}
