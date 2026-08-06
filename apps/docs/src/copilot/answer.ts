import type { UIMessageChunk } from '@janux/agent/local';
import { renderMarkdown } from './markdown';

/** Reports the answer as it is written, and which tool is running while it isn't. */
export interface Progress {
  onText(markdown: string): void;
  onTool(name: string): void;
}

export interface Answer {
  /** Raw markdown, for the conversation history. */
  text: string;
  /** Sanitized HTML, for rendering. */
  html: string;
  /** Why the run ended, so a stop is never mistaken for an exhausted search. */
  outcome: 'answered' | 'stopped' | 'failed';
}

interface Streamed {
  text: string;
  outcome: Answer['outcome'];
  error?: string;
}

/** Reasoning-capable models wrap (possibly empty) thinking in think tags; never show them. */
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;

/** A truncated generation can leave the last think block unclosed. */
const OPEN_THINK = /<think>[\s\S]*$/;

export function stripThink(text: string): string {
  return text.replace(THINK_BLOCK, '').replace(OPEN_THINK, '').trim();
}

const NOTHING_FOUND = 'I could not find an answer for that in the docs.';

/** `for await` over a ReadableStream is not universal yet (Safari); a reader is. */
async function consume(stream: ReadableStream<UIMessageChunk>, progress: Progress): Promise<Streamed> {
  const reader = stream.getReader();
  let text = '';
  let ranTool = false;
  let end: Streamed | undefined;

  while (!end) {
    const { done, value } = await reader.read();

    if (done) break;
    /*
     * Text written before a tool ran is a guess about what the tool will say,
     * and the model is free to be wrong: asked to reset a guarded counter it
     * announced the counter was back to zero, then the approval it was actually
     * waiting on landed and it said so again, properly. Both sentences stayed
     * on screen, contradicting each other. So a text part that opens *after* a
     * tool call replaces the narration instead of being glued under it — while
     * parts within one turn still join, since that is one answer in pieces.
     */
    if (value.type === 'text-start' && text) {
      text = ranTool ? '' : `${text}\n\n`;
      ranTool = false;
    }
    // Stripped per delta, not once at the end: the model's reasoning would
    // otherwise sit in the panel for the whole run and vanish on the last paint.
    if (value.type === 'text-delta') progress.onText(stripThink((text += value.delta ?? '')));
    // Both signals: only `tool-output-available` is minted here, `tool-input-available`
    // is the provider's and not every one sends it — keying on that alone left the
    // guess standing on the models that don't.
    if (value.type === 'tool-output-available' || value.type === 'tool-output-denied') ranTool = true;
    if (value.type === 'tool-input-available') {
      ranTool = true;
      progress.onTool(String(value.toolName));
    }
    if (value.type === 'abort') end = { text, outcome: 'stopped' };
    if (value.type === 'error') end = { text, outcome: 'failed', error: String(value.errorText) };
  }

  return end ?? { text, outcome: 'answered' };
}

/**
 * A failed run must never read as an answer. A 429 from the rate limiter and a
 * 503 setup card both arrive as `error` chunks, and answering "the docs do not
 * cover that" blames the documentation for a transport problem — then writes
 * that lie into the history the next turn is built from.
 */
/**
 * A refusal is our own sentence, not model output — the mount's setup card names
 * the variable to set, and markdown would eat the underscores in `/_janux/llm`
 * (and `JANUX_MODEL`) on the way to the screen.
 */
const MARKDOWN_CHARS = /([\\`*_{}[\]()#+\-.!])/g;

function asProse(message: string): string {
  return message.replace(MARKDOWN_CHARS, '\\$1');
}

function messageFor({ text, outcome, error }: Streamed): string {
  if (outcome === 'failed') return asProse(String(error).replace(/^Error:\s*/, ''));
  if (outcome === 'stopped') return text ? `${text}\n\n*(stopped)*` : '*(stopped)*';

  return text || NOTHING_FOUND;
}

/** What the copilot needs to be, for one run. */
export interface Runner {
  stream(question: string, signal?: AbortSignal): ReadableStream<UIMessageChunk>;
}

export async function askStream(
  runner: Runner,
  progress: Progress,
  goal = '',
  signal?: AbortSignal,
): Promise<Answer> {
  const streamed = await consume(runner.stream(goal, signal), progress);
  const text = messageFor({ ...streamed, text: stripThink(streamed.text) });

  return { text, html: renderMarkdown(text), outcome: streamed.outcome };
}

/** The reader a resumed turn needs: chunks to paint, and the turn to wait on. */
export interface Resumable {
  subscribe(listener: (chunk: UIMessageChunk) => void): () => void;
  resumeInterrupted(): Promise<{ text?: string } | undefined>;
}

/**
 * An answer a reload cut in half, painted as the server replays it. Undefined
 * when there was nothing in flight, which is the case on almost every load.
 */
export async function resumedAnswer(llm: Resumable, progress: Progress): Promise<Answer | undefined> {
  let text = '';
  const stop = llm.subscribe((chunk) => {
    if (chunk.type === 'text-delta') progress.onText(stripThink((text += chunk.delta ?? '')));
    if (chunk.type === 'tool-input-available') progress.onTool(String(chunk.toolName));
  });
  const reply = await llm.resumeInterrupted().finally(stop).catch(() => undefined);

  if (!reply) return undefined;
  const answer = messageFor({ text: stripThink(reply.text ?? ''), outcome: 'answered' });

  return { text: answer, html: renderMarkdown(answer), outcome: 'answered' };
}
