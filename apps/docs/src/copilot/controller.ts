import { marked } from 'marked';
import { createCopilot, localLlm, serverLlm, supportsLocalLlm, type Copilot, type Llm } from '@janux/agent/local';
import { createNavigateTool } from 'janux/client';
import { readPage, registerDocsTools, searchMatches } from './docs-tools';

export { supportsLocalLlm };

export interface Exchange {
  role: string;
  text: string;
}

export interface Reply {
  /** Raw markdown, for the conversation history. */
  text: string;
  /** Sanitized HTML, for rendering. */
  html: string;
}

const SCRIPT_BLOCKS = /<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi;
const EVENT_ATTRS = /\son\w+\s*=\s*("[^"]*"|'[^']*')/gi;
const JS_URLS = /javascript:/gi;

/** marked does not sanitize; the model's output never gets to run code in the page. */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;

  return html.replace(SCRIPT_BLOCKS, '').replace(EVENT_ATTRS, '').replace(JS_URLS, '');
}

const INSTRUCTIONS =
  'You are the Janux documentation copilot. Answer ONLY from the provided page content ' +
  'and search results — never from memory. If they are not enough, call read_doc on ' +
  'another listed path, or search_docs with a better query. When the user asks to open, ' +
  'go to, or navigate to a page, call navigate with its path (pick it from the search ' +
  'results) and confirm in one sentence. Otherwise answer in 2-6 sentences (with a code ' +
  'example when the page shows one), then the exact path of the page you used on its own ' +
  'line (e.g. /docs/guide/api-rpc). If the docs do not cover something, say so. ' +
  'Reply in the language the user writes in.';

const HISTORY_LIMIT = 6;

/** Qwen3 wraps (possibly empty) reasoning in think tags; never show them. */
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;

/** A truncated generation can leave the last think block unclosed. */
const OPEN_THINK = /<think>[\s\S]*$/;

export function stripThink(text: string): string {
  return text.replace(THINK_BLOCK, '').replace(OPEN_THINK, '').trim();
}

let copilot: Copilot | undefined;

/** Opt-in step tracing: `localStorage.setItem('copilot-debug', '1')`. */
function onStep(step: unknown): void {
  if (localStorage.getItem('copilot-debug')) {
    console.debug('[copilot]', JSON.stringify(step).slice(0, 600));
  }
}

function start(llm: Llm, instructions: string): void {
  registerDocsTools();
  copilot = createCopilot({ llm, instructions, manifestTools: false, maxSteps: 6, onStep });
}

/** Download (or reuse from cache) the in-browser model, then wire the copilot to it. */
export async function setupLocal(onProgress: (percent: number) => void): Promise<void> {
  const llm = localLlm();

  await llm.load({ onProgress: (fraction) => onProgress(Math.round(fraction * 100)) });
  start(llm, INSTRUCTIONS);
}

/** Wire the copilot to the app server's model (`/_janux/llm`) instead. */
export function setupServer(): void {
  start(serverLlm(), INSTRUCTIONS);
}

function withHistory(question: string, history: Exchange[]): string {
  const recent = history.slice(-HISTORY_LIMIT);

  if (recent.length === 0) return question;
  const transcript = recent.map(({ role, text }) => `${role}: ${text}`).join('\n');

  return `Previous conversation:\n${transcript}\n\nNew question: ${question}`;
}

/** How much of the top-matching page rides along in the prompt (small-model context budget). */
const PRE_READ_CHARS = 2500;

/**
 * Deterministic grounding: search up-front and pre-read the top match, so the
 * model answers from real content and cites a real path. Tools stay available
 * for follow-up reads.
 */
async function withGrounding(goal: string, question: string): Promise<string> {
  const matches = await searchMatches(question).catch(() => []);

  if (matches.length === 0) return goal;
  const results = matches.map(({ title, path, snippet }) => `- ${title} (${path}): ${snippet}`).join('\n');
  const top = await readPage(matches[0]!.path, PRE_READ_CHARS).catch(() => undefined);
  const content = top ? `\n\nContent of ${top.path} ("${top.title}"):\n${top.text}` : '';
  const note = 'Context for ANSWERING only — if the user asked to open, go to, or navigate to a page, call the navigate tool with its path instead of answering:';

  return `${goal}\n\n${note}\nSearch results:\n${results}${content}`;
}

/** Imperative navigation openers (es/en); mid-sentence verbs go through the model. */
export const NAV_INTENT =
  /^\s*(?:please\s+|por\s+favor\s+)?(?:navega(?:r)?(?:\s+a)?|abre|open|go\s+to|goto|ve\s+a|ll[eé]vame\s+a|take\s+me\s+to)\b/i;

/**
 * A 0.6B model narrates instead of acting often enough that explicit
 * navigation requests are routed deterministically: best search hit → the
 * framework's navigate tool (glow included). Ambiguous phrasing still goes
 * to the model, which has the same tool.
 */
async function tryDirectNavigation(question: string): Promise<Reply | undefined> {
  if (!NAV_INTENT.test(question)) return undefined;
  const top = (await searchMatches(question).catch(() => []))[0];

  if (!top) return undefined;
  const outcome = createNavigateTool().execute({ path: top.path }) as { error?: string };

  if (outcome?.error) return undefined;
  const text = `Opening **${top.title}** (${top.path})…`;

  return { text, html: renderMarkdown(text) };
}

export async function ask(question: string, history: Exchange[]): Promise<Reply> {
  if (!copilot) throw new Error('copilot not ready');
  const direct = await tryDirectNavigation(question);

  if (direct) return direct;
  const goal = await withGrounding(withHistory(question, history), question);
  const result = await copilot.ask(goal);
  const text = stripThink(result.text) || 'I could not find an answer for that in the docs.';

  return { text, html: renderMarkdown(text) };
}
