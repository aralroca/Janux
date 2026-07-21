type CallFn = (tool: string, input: unknown) => void;
type ApproveFn = (id: string) => void;

function el(tag: string, className: string, html?: string): HTMLElement {
  const node = document.createElement(tag);

  node.className = className;
  if (html !== undefined) node.innerHTML = html;

  return node;
}

function guardBadge(guard: string): string {
  return `<span class="guard ${guard}">${guard}</span>`;
}

function toolRow(tool: any, onCall: CallFn): HTMLElement {
  const row = el('div', 'tool-row', `<code>${tool.name}</code>${guardBadge(tool.guard)}<br><small>${tool.description ?? ''}</small>`);
  const inputBox = document.createElement('textarea');
  const button = document.createElement('button');

  inputBox.rows = 2;
  inputBox.value = tool.input ? JSON.stringify(exampleInput(tool.input), null, 0) : '{}';
  button.textContent = 'Call as agent';
  button.addEventListener('click', () => onCall(tool.name, JSON.parse(inputBox.value || '{}')));
  if (tool.input) row.appendChild(inputBox);
  row.appendChild(button);

  return row;
}

function exampleInput(schema: any): Record<string, unknown> {
  const entries = Object.entries(schema.properties ?? {}).map(([key, prop]: [string, any]) => {
    if (prop.default !== undefined) return [key, prop.default];
    if (prop.type === 'integer' || prop.type === 'number') return [key, 1];
    if (prop.enum) return [key, prop.enum[0]];

    return [key, 'example'];
  });

  return Object.fromEntries(entries);
}

/** Re-renders the agent pane from a fresh manifest + resource snapshot. */
export function renderAgentPanel(
  pane: HTMLElement,
  manifest: any,
  resource: any,
  onCall: CallFn,
): void {
  pane.innerHTML = '';
  pane.appendChild(el('h2', '', '🤖 What the agent sees'));
  manifest.tools.forEach((tool: any) => pane.appendChild(toolRow(tool, onCall)));
  pane.appendChild(el('h2', '', `Resource <code>${resource.uri}</code>`));
  const pre = el('pre', 'resource shiki');

  pre.textContent = JSON.stringify({ state: resource.state, derived: resource.derived }, null, 2);
  pane.appendChild(pre);
  pane.appendChild(el('div', 'proposal-slot'));
}

/** Shows a pending proposal card with Approve/Reject; returns nothing if slot missing. */
export function renderProposal(pane: HTMLElement, proposal: any, onApprove: ApproveFn): void {
  const slot = pane.querySelector('.proposal-slot');

  if (!slot) return;
  slot.innerHTML = '';
  const card = el(
    'div',
    'tool-row',
    `⏸ Proposal: <code>${proposal.tool}</code> ${JSON.stringify(proposal.input ?? {})}<br><small>guard: confirm — a human must approve</small>`,
  );
  const approve = document.createElement('button');

  approve.textContent = 'Approve';
  approve.addEventListener('click', () => {
    onApprove(proposal.id);
    slot.innerHTML = '';
  });
  card.appendChild(approve);
  slot.appendChild(card);
}
