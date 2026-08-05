import type { AgentDeps, AgentMount } from './server';

/**
 * Channels: the same agent, reached from outside the browser.
 *
 * A channel is a *transport adapter*, never a second runtime. It answers two
 * questions — what did the human say (`receive`), and how does this transport
 * want the answer (`send`) — and everything between them is the ordinary agent
 * turn: the same `AgentMount.handle`, over the same `AgentDeps`, so the same
 * guards decide what may run. Invariant 4 is why that is not merely convenient:
 * a channel that enforced permissions of its own would be a second pipeline,
 * and the first forged call through it would look exactly like a real one.
 *
 * What a channel cannot carry is the browser. `ui_*` and the page's own intents
 * need a live DOM to act on, so the turn is told they are not available here
 * rather than handed tools that cannot run — see `channelSurface` in
 * `@janux/agent`, which is where the reduced surface is decided.
 *
 * Two of a transport's answers are its own, and never cost a model turn: a
 * handshake or a rejected signature (`receive` returns a `Response`), and an
 * event that carries no message (`receive` returns nothing).
 */

export const CHANNELS_PREFIX = '/_janux/channels/';

/** One inbound message, once the transport's envelope is off it. */
export interface ChannelMessage {
  text: string;
  /** Conversation key for `harness.memory` — a Slack channel, a Discord thread, a caller's id. */
  threadId?: string;
  /** The app path whose manifest frames the turn. Defaults to `/`. */
  path?: string;
}

/** The finished turn, as a transport has to render it. */
export interface ChannelReply {
  text: string;
  /** The thread this turn belongs to, so the next message can continue it. */
  threadId?: string;
  /** Set when the turn ended in a refusal, a provider failure or missing setup. */
  error?: string;
  /**
   * What went wrong underneath — a provider's own message, usually. It travels
   * so an operator can diagnose without reading server logs, and it is separate
   * from `text` so a chat transport can show the sentence and not the stack:
   * `slackChannel` and `discordChannel` render `text` alone.
   */
  detail?: string;
}

export interface ChannelDef {
  /** The transport's request → a turn, a ready `Response`, or nothing to ignore it. */
  receive(req: Request): Promise<ChannelMessage | Response | undefined> | ChannelMessage | Response | undefined;
  /** The turn's answer → the transport's response. */
  send(reply: ChannelReply): Response | Promise<Response>;
}

/** `/_janux/channels/slack` → `slack`; anything else → nothing. */
export function channelOf(pathname: string): string | undefined {
  return pathname.startsWith(CHANNELS_PREFIX) ? pathname.slice(CHANNELS_PREFIX.length) : undefined;
}

/**
 * The turn, as a request the agent mount already knows how to answer. The
 * transport's own headers travel with it: `identityFor` decides who a webhook
 * caller is, and it cannot do that from headers we invented.
 */
function agentRequest(req: Request, channel: string, message: ChannelMessage): Request {
  const headers = new Headers(req.headers);

  headers.set('content-type', 'application/json');
  headers.delete('content-length');

  return new Request(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      channel,
      messages: [{ role: 'user', content: message.text }],
      ...(message.threadId !== undefined && { threadId: message.threadId }),
      ...(message.path !== undefined && { path: message.path }),
    }),
    signal: req.signal,
  });
}

const FAILED = 'The agent could not answer that right now.';

/**
 * Every envelope the loop can end a turn with, flattened to what a transport
 * can actually say. A channel renders text; a refusal and a provider error are
 * still text, marked so the transport can style them — silence would leave the
 * human waiting on a message that is never coming.
 */
function replyOf(envelope: Record<string, any>, message: ChannelMessage): ChannelReply {
  const threadId = envelope.threadId ?? message.threadId;
  // An envelope we could not read at all is still a failed turn: falling back
  // to a bare message would report it to the human as an ordinary answer.
  const error = envelope.type === 'text' ? undefined : (envelope.error ?? envelope.type ?? 'agent_error');
  const text = typeof envelope.text === 'string' && envelope.text !== '' ? envelope.text : envelope.message;

  return {
    text: typeof text === 'string' ? text : FAILED,
    ...(threadId !== undefined && { threadId }),
    ...(error && { error }),
    ...(typeof envelope.detail === 'string' && { detail: envelope.detail }),
  };
}

/**
 * One channel request end to end. The 204 is deliberate: a transport that sent
 * an event with nothing to answer (a join notice, a bot's own message) gets an
 * acknowledgement, not an empty turn it would have to bill someone for.
 */
export async function handleChannel(req: Request, name: string, channel: ChannelDef, agent: AgentMount, deps: AgentDeps): Promise<Response> {
  const received = await channel.receive(req);

  if (received instanceof Response) return received;
  if (!received) return new Response(null, { status: 204 });
  const answer = await agent.handle(agentRequest(req, name, received), deps);
  const envelope = await answer.json().catch(() => ({}));

  return channel.send(replyOf(envelope as Record<string, any>, received));
}
