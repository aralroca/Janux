/**
 * What has to outlive a page load for an interrupted answer to be picked back
 * up: the id of the turn still being generated, and the question it is
 * answering.
 *
 * Deliberately its own module with no imports. The panel checks on every page
 * load whether there is anything to resume, and that check has to stay cheap —
 * the agent runtime is a dynamic import that only a visitor who actually uses
 * Ask AI should pay for. Reading a key is not a reason to load it.
 */

/** The entry `serverLlm({ resume })` keeps the in-flight stream id under. */
export const STREAM_KEY = 'janux-docs:copilot-stream';
const QUESTION_KEY = 'janux-docs:copilot-question';

const store = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage);

/** Whether a previous page load left an answer mid-sentence. */
export const wasInterrupted = (): boolean => Boolean(store()?.getItem(STREAM_KEY));

export const interruptedQuestion = (): string => store()?.getItem(QUESTION_KEY) ?? '';

export const rememberQuestion = (text: string): void => store()?.setItem(QUESTION_KEY, text);

export const forgetQuestion = (): void => store()?.removeItem(QUESTION_KEY);
