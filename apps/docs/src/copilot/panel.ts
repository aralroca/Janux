import type { Exchange, Progress } from './controller';

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

/** Chat UX: the field empties the moment the question is sent (uncontrolled input). */
export function clearInput(): void {
  const field = document.querySelector<HTMLInputElement>('.copilot-panel input[name="text"]');

  if (field) field.value = '';
}

