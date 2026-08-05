import { createCopilot, serverLlm, type Copilot, type StreamingLlm } from '@janux/agent/local';
import { askStream, resumedAnswer, type Answer, type Progress } from './answer';
import { docsMap, readPage, registerDocsTools, searchMatches } from './docs-tools';
import { STREAM_KEY } from './interrupted';
import { renderMarkdown } from './markdown';

export { renderMarkdown };
export type { Answer, Progress };

export interface Exchange {
  role: string;
  text: string;
}

const INSTRUCTIONS = [
  'You are the Janux documentation copilot, embedded in the docs site itself.',
  'Answer ONLY from the documentation: the page map below, the search results and read_doc.',
  'Never answer from memory, and say so plainly when the docs do not cover something.',
  'Always end the answer with the page you used as a markdown link, including the section anchor:',
  '[Title](/docs/guide/intents-and-guards#proposals).',
  'To take the user somewhere, call navigate with that same path — the anchor scrolls to the section.',
  'You can also operate this site through its own tools (switching the theme, for instance).',
  'Answer in 2-6 sentences, with a code example when the page has one.',
  'Reply in the language the user writes in.',
].join(' ');

const HISTORY_LIMIT = 6;

/**
 * How much of the top match rides along in the goal. It buys the single-turn
 * answer, but it sits in the part of the prompt no provider can cache, and it is
 * re-sent on every turn of the loop — `read_doc` is there for the rest.
 */
const PRE_READ_CHARS = 6000;

let ready: Promise<Copilot> | undefined;

/**
 * Held apart from the copilot because resuming is not a run: the turn is
 * already being generated on the server, and all this page needs is the reader.
 */
const brain: StreamingLlm = serverLlm({ stream: true, resume: { key: STREAM_KEY } });

/** Opt-in step tracing: `localStorage.setItem('copilot-debug', '1')`. */
function onStep(step: unknown): void {
  if (localStorage.getItem('copilot-debug')) {
    console.debug('[copilot]', JSON.stringify(step).slice(0, 600));
  }
}

/**
 * Wires the copilot to the app server's model (`/_janux/llm`, DeepSeek V4 Flash
 * over OpenRouter). The whole page map rides in the instructions, so the model
 * knows the documentation before it searches it, and the site's own manifest
 * tools are on the table — minus `api.docs.*`, which the client-side
 * `search_docs`/`read_doc` already cover with the static index.
 */
async function build(): Promise<Copilot> {
  registerDocsTools();
  const map = await docsMap().catch(() => '');

  return createCopilot({
    llm: brain,
    instructions: `${INSTRUCTIONS}\n\nPages and sections:\n${map}`,
    // `copilot.*` too: the panel's own intents are not tools for the model —
    // closing the panel it is answering into is not a feature.
    tools: { exclude: ['api.docs.*', 'copilot.*'] },
    maxSteps: 6,
    onStep,
  });
}

/** Idempotent and re-entrant: the promise is the latch, so a double open builds one copilot. */
export function setup(): Promise<Copilot> {
  ready ??= build();

  return ready;
}

function withHistory(question: string, history: Exchange[]): string {
  const recent = history.slice(-HISTORY_LIMIT);

  if (recent.length === 0) return question;
  const transcript = recent.map(({ role, text }) => `${role}: ${text}`).join('\n');

  return `Previous conversation:\n${transcript}\n\nNew question: ${question}`;
}

/**
 * Deterministic grounding: search up-front and pre-read the top match, so the
 * model can answer in a single turn. Tools stay available for follow-up reads.
 */
async function withGrounding(goal: string, question: string): Promise<string> {
  const matches = await searchMatches(question).catch(() => []);

  if (matches.length === 0) return goal;
  const results = matches.map(({ title, path, snippet }) => `- ${title} (${path}): ${snippet}`).join('\n');
  const top = await readPage(matches[0]!.path, PRE_READ_CHARS).catch(() => undefined);
  const content = top ? `\n\nContent of ${top.path} ("${top.title}"):\n${top.text}` : '';

  return `${goal}\n\nSearch results:\n${results}${content}`;
}

export async function ask(
  question: string,
  history: Exchange[],
  progress: Progress,
  signal?: AbortSignal,
): Promise<Answer> {
  const running = await setup();
  const goal = await withGrounding(withHistory(question, history), question);

  return askStream(running, progress, goal, signal);
}

/**
 * The answer a reload interrupted, replayed into the panel. No search, no
 * grounding and no model call: the turn is already running on the server, and
 * this only re-attaches a reader to it.
 */
export function resume(progress: Progress): Promise<Answer | undefined> {
  return resumedAnswer(brain, progress);
}
