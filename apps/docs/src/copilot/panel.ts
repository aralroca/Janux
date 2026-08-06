import { decideApproval, type AgentProposal, type ApprovalSurface } from '../approvals';
import type { Exchange, Progress } from './controller';
import { forgetQuestion, interruptedQuestion, rememberQuestion, wasInterrupted } from './interrupted';

export { rememberQuestion, wasInterrupted };

function summarize(proposal: AgentProposal): string {
  const input = proposal.input === undefined ? '' : ` ${JSON.stringify(proposal.input)}`;

  return `${proposal.tool}${input}`;
}

/**
 * The chat as a place to approve from.
 *
 * It goes through the island's own `showProposal` intent rather than writing
 * `state` directly: a proposal can be raised by a WebMCP client with no intent
 * anywhere on the stack, and Janux refuses those writes by design (RFC §4.4) —
 * which left the card unrendered and the agent's call parked on a decision the
 * reader was never shown.
 */
export function approvalSurface(state: any, intents: any): ApprovalSurface {
  const post = (id: string, summary: string): void => {
    intents.showProposal({ id, summary }).catch(console.error);
  };

  return {
    show(proposal) {
      if (!state.open) return false;
      post(proposal.id, summarize(proposal));
      scrollToLatest();

      return true;
    },
    clear(id) {
      if (state.proposalId === id) post('', '');
    },
  };
}

/** Both buttons, one path: the agent pane's card settles the same proposal the same way. */
export function settleProposal(state: any, approved: boolean): void {
  const id = state.proposalId;

  if (!id) return;
  state.proposalId = '';
  decideApproval(id, approved);
}

/**
 * The agent runtime (gui-agent, the markdown renderer) loads only when the
 * visitor actually uses Ask AI, and only once.
 */
let controllerModule: Promise<typeof import('./controller')> | undefined;

export function controller(): Promise<typeof import('./controller')> {
  controllerModule ??= import('./controller');

  return controllerModule;
}

/** The panel follows the answer as it is written. */
export function scrollToLatest(): void {
  const chat = document.querySelector('.copilot-panel .chat');

  if (chat) chat.scrollTop = chat.scrollHeight;
}

/**
 * A few paints a second, not one per token. Each paint costs a full markdown
 * parse plus a rebuilt bubble, and tokens arrive faster than anyone can read —
 * painting every one is quadratic work that also drops the reader's selection.
 *
 * Throttled rather than deferred to a frame: a write from a `requestAnimationFrame`
 * callback is outside the intent that started the run, and state mutations there
 * are illegal by design (RFC §4.4). `converse` paints the final answer anyway,
 * so nothing is lost by skipping the last partial one.
 */
const PAINT_INTERVAL_MS = 60;

function throttledPaint(message: any, renderMarkdown: (text: string) => string): (markdown: string) => void {
  let last = 0;

  return (markdown) => {
    const now = performance.now();

    if (now - last < PAINT_INTERVAL_MS) return;
    last = now;
    message.html = renderMarkdown(markdown);
    scrollToLatest();
  };
}

function progressFor(state: any, message: any, renderMarkdown: (text: string) => string): Progress {
  const paint = throttledPaint(message, renderMarkdown);

  return {
    onText(markdown) {
      state.status = '';
      paint(markdown);
    },
    onTool(name) {
      state.status = name === 'navigate' ? 'Opening the page…' : `Running ${name}…`;
    },
  };
}

export async function converse(state: any, text: string, signal: AbortSignal): Promise<void> {
  // Captured before the await: `at(-1)` resolves to an absolute index, and the
  // bubble this run owns must not be the one a later message took.
  const message = state.messages.at(-1);
  const history: Exchange[] = state.messages
    .slice(0, -2)
    .map(({ role, text: line }: Exchange) => ({ role, text: line }));
  const { ask, renderMarkdown } = await controller();
  const reply = await ask(text, history, progressFor(state, message, renderMarkdown), signal).catch(
    (error: unknown) => ({ text: `Something went wrong: ${String(error)}`, html: '' }),
  );

  message.text = reply.text;
  message.html = reply.html || renderMarkdown(reply.text);
  scrollToLatest();
}

/**
 * Picks an answer back up after a reload: the panel opens on the question that
 * was asked before the page went away, and the server replays the turn into the
 * bubble it was already writing.
 *
 * The two bubbles are pushed before the runtime is imported, so the reader sees
 * the conversation restored immediately rather than after a chunk of JavaScript.
 */
/** The conversation as it stood when the page went away: question asked, answer pending. */
function restoreExchange(state: any): void {
  state.open = true;
  state.messages.push({ role: 'user', text: interruptedQuestion(), html: '' });
  state.messages.push({ role: 'assistant', text: '', html: '' });
  state.busy = true;
  state.status = 'Picking the answer back up…';
}

async function paintResumed(state: any, message: any): Promise<void> {
  const { resume, renderMarkdown } = await controller();
  const answer = await resume(progressFor(state, message, renderMarkdown));

  // Nothing to resume after all — expired, or finished while the page was gone.
  // An empty pair of bubbles is worse than no bubbles.
  if (!answer) return state.messages.splice(-2, 2);
  message.text = answer.text;
  message.html = answer.html;
}

export async function resumeAfterReload(state: any): Promise<void> {
  restoreExchange(state);
  const message = state.messages.at(-1);

  await paintResumed(state, message).catch(() => state.messages.splice(-2, 2));
  forgetQuestion();
  state.busy = false;
  state.status = '';
  scrollToLatest();
  // Only now, and inside the effect's own chain so the write is legal: the
  // copilot itself is what the next question needs, not this answer.
  const { setup } = await controller();

  await setup();
  state.ready = true;
}

/** Chat UX: the field empties the moment the question is sent (uncontrolled input). */
export function clearInput(): void {
  const field = document.querySelector<HTMLInputElement>('.copilot-panel input[name="text"]');

  if (field) field.value = '';
}

