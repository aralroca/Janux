import type { LlmResponse } from '@aralroca/gui-agent';
import type { UIMessageChunk } from 'ai';
import { sseEvents } from '../sse';
import type { ResumeSession } from './resume';

/**
 * Assembling one model turn out of the frames that carry it — however many
 * connections that takes.
 *
 * The distinction the whole file turns on: a turn ending and a *connection*
 * ending are different events, and only the protocol can tell them apart. An
 * SSE body that simply stops is not an exception on this side — a dropped
 * network looks exactly like a polite close — so completion is judged by the
 * stream's own `finish` chunk and never by the socket going quiet.
 */

export type ChunkListener = (chunk: UIMessageChunk) => void;

/** One turn being assembled, across however many transports it takes. */
interface Turn {
  text: string[];
  toolCalls: any[];
  /** The turn reached its own end — as opposed to the connection reaching one. */
  finished: boolean;
}

const newTurn = (): Turn => ({ text: [], toolCalls: [], finished: false });

const replyOf = (turn: Turn): LlmResponse => ({ text: turn.text.join(''), toolCalls: turn.toolCalls });

function accumulate(chunk: UIMessageChunk, turn: Turn): void {
  if (chunk.type === 'text-delta') turn.text.push(chunk.delta ?? '');
  if (chunk.type === 'finish') turn.finished = true;
  if (chunk.type === 'error') {
    // The turn's own failure, not a transport hiccup: reconnecting would only
    // fetch the same error again.
    turn.finished = true;
    throw new Error(chunk.errorText ?? 'llm stream error');
  }
  if (chunk.type === 'tool-input-available') {
    turn.toolCalls.push({ id: chunk.toolCallId, name: chunk.toolName, arguments: chunk.input ?? {} });
  }
}

async function readInto(
  body: ReadableStream<Uint8Array>,
  emit: ChunkListener,
  turn: Turn,
  session?: ResumeSession,
): Promise<void> {
  for await (const event of sseEvents(body)) {
    const chunk = JSON.parse(event.data) as UIMessageChunk;

    if (session && !session.accepts(event.id)) continue;
    // `accumulate` throws on an error chunk, and the thrown turn is what the
    // run reports — forwarding it as well would surface the same failure twice.
    accumulate(chunk, turn);
    emit(chunk);
    session?.advance(event.id);
  }
}

/** One transport, one turn: what a stream that is not resumable can promise. */
export async function readTurn(body: ReadableStream<Uint8Array>, emit: ChunkListener): Promise<LlmResponse> {
  const turn = newTurn();

  await readInto(body, emit, turn);

  return replyOf(turn);
}

/**
 * The same turn across transports: when a connection ends before the turn does,
 * it is picked back up where it stopped. The last transport's outcome is what
 * gets reported — an error thrown by a connection that was then successfully
 * resumed is not a failure, it is the reason there was a second connection.
 */
export async function readResumable(
  first: Response,
  emit: ChunkListener,
  session: ResumeSession,
): Promise<LlmResponse> {
  const turn = newTurn();
  let response: Response | undefined = first;
  let failure: unknown;

  session.begin(first.headers.get('x-janux-stream-id'));
  while (response && !turn.finished) {
    failure = await readInto(response.body!, emit, turn, session).then(() => undefined, (error) => error);
    response = turn.finished ? undefined : await session.reconnect();
  }
  session.finish();
  if (failure) throw failure;

  return replyOf(turn);
}
