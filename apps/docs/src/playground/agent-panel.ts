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
  // A field an agent (or a screen reader) can name, not an anonymous textarea.
  inputBox.setAttribute('aria-label', `Input for ${tool.name}`);
  inputBox.value = tool.input ? JSON.stringify(exampleInput(tool.input), null, 0) : '{}';
  button.textContent = 'Call as agent';
  button.addEventListener('click', () => {
    try {
      onCall(tool.name, JSON.parse(inputBox.value || '{}'));
    } catch (error) {
      inputBox.style.borderColor = '#ef4444';
      inputBox.title = String(error);
    }
  });
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

interface FeedbackToggle {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function feedbackToggle(text: string, state: FeedbackToggle): HTMLElement {
  const label = el('label', 'glow-toggle');
  const box = document.createElement('input');

  box.type = 'checkbox';
  box.checked = state.enabled;
  box.addEventListener('change', () => state.onToggle(box.checked));
  label.appendChild(box);
  label.appendChild(document.createTextNode(text));

  return label;
}

/** Re-renders the agent pane from a fresh manifest + resource snapshot. */
export function renderAgentPanel(
  pane: HTMLElement,
  manifest: any,
  resource: any,
  onCall: CallFn,
  feedback?: { glow: FeedbackToggle; cursor: FeedbackToggle },
): void {
  pane.innerHTML = '';
  pane.appendChild(el('h2', '', '🤖 What the agent sees'));
  if (feedback) {
    pane.appendChild(feedbackToggle(' ✨ Glow the UI while the agent acts', feedback.glow));
    pane.appendChild(feedbackToggle(' 🖱️ Move a simulated cursor to what it touches', feedback.cursor));
  }
  manifest.tools.forEach((tool: any) => pane.appendChild(toolRow(tool, onCall)));
  pane.appendChild(el('h2', '', `Resource <code>${resource.uri}</code>`));
  const pre = el('pre', 'resource shiki');

  pre.textContent = JSON.stringify({ state: resource.state, derived: resource.derived }, null, 2);
  pane.appendChild(pre);
  pane.appendChild(el('div', 'proposal-slot'));
}

/** Shows a pending proposal as a high-contrast alert with Approve/Reject. */
export function renderProposal(
  pane: HTMLElement,
  proposal: any,
  onApprove: ApproveFn,
  onReject: ApproveFn,
): void {
  const slot = pane.querySelector('.proposal-slot');

  if (!slot) return;
  slot.innerHTML = '';
  const card = el(
    'div',
    'proposal-card',
    `<p class="proposal-title">⏸ Approval required</p>
     <p>The agent wants to run <code>${proposal.tool}</code> ${JSON.stringify(proposal.input ?? {})}</p>
     <p class="proposal-why">guard: confirm — nothing happens until you decide.</p>`,
  );
  const actions = el('div', 'proposal-actions');
  const approve = document.createElement('button');
  const reject = document.createElement('button');

  card.setAttribute('role', 'alert');
  approve.textContent = 'Approve';
  approve.className = 'approve';
  reject.textContent = 'Reject';
  reject.className = 'reject';
  approve.addEventListener('click', () => {
    onApprove(proposal.id);
    slot.innerHTML = '';
  });
  reject.addEventListener('click', () => {
    onReject(proposal.id);
    slot.innerHTML = '';
  });
  actions.appendChild(approve);
  actions.appendChild(reject);
  card.appendChild(actions);
  slot.appendChild(card);
  approve.focus();
}
