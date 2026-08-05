import { describe, expect, it } from 'bun:test';
import { schema, str } from 'janux';
import { api } from './api';
import type { AgentMount, ChannelDef } from './index';
import { createJanuxServer } from './index';

/**
 * A channel is a transport adapter over the ordinary agent turn. What these
 * cases pin is the "no second runtime" part of that claim: the same mount, the
 * same deps, and therefore the same guards — plus the two ways a transport
 * legitimately answers on its own (a handshake, and an event worth ignoring).
 */

const echoChannel = (seen: Request[] = []): ChannelDef => ({
  async receive(req) {
    seen.push(req);
    const body = (await req.json()) as { text?: string };

    return body.text ? { text: body.text } : undefined;
  },
  send: (reply) => Response.json(reply),
});

/** Records what the agent mount was handed, and answers like a finished turn. */
function recordingAgent(bodies: any[]): AgentMount {
  return {
    handle: async (req) => {
      bodies.push(await req.json());

      return Response.json({ type: 'text', text: 'hello from the loop', threadId: 't1' });
    },
  };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

describe('channels on the server', () => {
  it('routes /_janux/channels/<name> to that channel and runs the ordinary agent turn', async () => {
    const bodies: any[] = [];
    const server = createJanuxServer({ agent: recordingAgent(bodies), channels: { webhook: echoChannel() } });

    const response = await server.fetch(post('/_janux/channels/webhook', { text: 'how much is the cart?' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'hello from the loop', threadId: 't1' });
    // The turn the loop saw: an ordinary user message, labelled with the channel
    // it arrived on — never a second protocol.
    expect(bodies).toEqual([{ channel: 'webhook', messages: [{ role: 'user', content: 'how much is the cart?' }] }]);
  });

  /** What keys `harness.memory`: the transport's own idea of a conversation. */
  it('carries the channel thread into the turn, and the turn thread back out', async () => {
    const bodies: any[] = [];
    const server = createJanuxServer({
      agent: {
        handle: async (req) => {
          bodies.push(await req.json());

          return Response.json({ type: 'text', text: 'still here' });
        },
      },
      channels: {
        slack: {
          receive: async (req) => ({ text: ((await req.json()) as { text: string }).text, threadId: 'slack:C123', path: '/orders' }),
          send: (reply) => Response.json(reply),
        },
      },
    });

    const reply = await (await server.fetch(post('/_janux/channels/slack', { text: 'what did I ask?' }))).json();

    expect(bodies[0]).toMatchObject({ threadId: 'slack:C123', path: '/orders' });
    // The mount answered without one, so the channel's own thread is what comes back.
    expect(reply).toMatchObject({ threadId: 'slack:C123' });
  });

  it('lets a channel answer the transport itself, without a turn (handshake, or a rejected signature)', async () => {
    const bodies: any[] = [];
    const server = createJanuxServer({
      agent: recordingAgent(bodies),
      channels: { handshake: { receive: () => new Response('challenge-token'), send: (reply) => Response.json(reply) } },
    });

    const response = await server.fetch(post('/_janux/channels/handshake', {}));

    expect(await response.text()).toBe('challenge-token');
    expect(bodies).toEqual([]); // no model was spent on a handshake
  });

  it('ignores an event that carries no message, with no turn and no body', async () => {
    const bodies: any[] = [];
    const server = createJanuxServer({ agent: recordingAgent(bodies), channels: { webhook: echoChannel() } });

    const response = await server.fetch(post('/_janux/channels/webhook', { text: '' }));

    expect(response.status).toBe(204);
    expect(bodies).toEqual([]);
  });

  /**
   * Every way a turn can end has to reach the human as words. Silence on a
   * refusal or a provider failure leaves somebody waiting for a message that is
   * never coming.
   */
  it.each([
    [{ type: 'text', text: 'four are pending' }, { text: 'four are pending' }],
    [{ type: 'refusal', reason: 'jailbreak', message: "I can't help with that." }, { text: "I can't help with that.", error: 'refusal' }],
    [{ type: 'setup', message: 'No model configured.' }, { text: 'No model configured.', error: 'setup' }],
    [
      // Why it failed survives the crossing: a caller told only "could not
      // answer" has nothing to act on, and the detail is the whole diagnosis.
      { type: 'error', error: 'provider_error', detail: 'Error: OpenRouter API error 402: insufficient credits' },
      {
        text: 'The agent could not answer that right now.',
        error: 'provider_error',
        detail: 'Error: OpenRouter API error 402: insufficient credits',
      },
    ],
    [undefined, { text: 'The agent could not answer that right now.', error: 'agent_error' }],
  ])('renders %o for the transport', async (envelope, expected) => {
    const agent: AgentMount = { handle: async () => (envelope ? Response.json(envelope) : new Response('not json at all')) };
    const server = createJanuxServer({ agent, channels: { webhook: echoChannel() } });

    expect(await (await server.fetch(post('/_janux/channels/webhook', { text: 'hi' }))).json()).toEqual(expected);
  });

  it('404s an undeclared channel, and the whole surface when the app declares none', async () => {
    const declared = createJanuxServer({ agent: recordingAgent([]), channels: { webhook: echoChannel() } });
    const none = createJanuxServer({ agent: recordingAgent([]) });

    expect((await declared.fetch(post('/_janux/channels/slack', { text: 'hi' }))).status).toBe(404);
    expect((await none.fetch(post('/_janux/channels/webhook', { text: 'hi' }))).status).toBe(404);
    // Own-property lookup only: a name off the prototype chain is not a channel.
    expect((await declared.fetch(post('/_janux/channels/constructor', { text: 'hi' }))).status).toBe(404);
  });

  it('hands the transport its own request, so identity is resolved from the real headers', async () => {
    const seen: Request[] = [];
    const bodies: any[] = [];
    const server = createJanuxServer({
      agent: {
        handle: async (req) => {
          bodies.push(req.headers.get('x-slack-signature'));

          return Response.json({ type: 'text', text: 'ok' });
        },
      },
      channels: { webhook: echoChannel(seen) },
    });

    await server.fetch(post('/_janux/channels/webhook', { text: 'hi' }, { 'x-slack-signature': 'v0=abc' }));

    expect(seen[0]!.headers.get('x-slack-signature')).toBe('v0=abc');
    // The turn the mount runs carries them too: `identityFor` cannot authorize a
    // webhook caller from headers it never sees.
    expect(bodies).toEqual(['v0=abc']);
  });

  it('runs a guarded tool through the same invocation pipeline: a confirm guard parks, it does not fire', async () => {
    const charges: string[] = [];
    const server = createJanuxServer({
      apis: {
        shop: {
          charge: api({
            description: 'Charge the card. Irreversible.',
            input: schema({ orderId: str() }),
            guard: 'confirm',
            run: ({ input }) => {
              charges.push(input.orderId);

              return { charged: input.orderId };
            },
          }),
        },
      },
      agent: { handle: async (_req, deps) => Response.json({ type: 'text', text: JSON.stringify(await deps.invoke('api.shop.charge', { orderId: 'o9' })) }) },
      channels: { webhook: echoChannel() },
    });

    const reply: any = await (await server.fetch(post('/_janux/channels/webhook', { text: 'charge order o9' }))).json();

    expect(JSON.parse(reply.text).status).toBe('proposal');
    expect(charges).toEqual([]); // a webhook is not a human either
  });

  it('needs no CSRF evidence: a webhook proves itself by signature, not by an origin it cannot send', async () => {
    const server = createJanuxServer({ agent: recordingAgent([]), channels: { webhook: echoChannel() } });

    const response = await server.fetch(post('/_janux/channels/webhook', { text: 'hi' }));

    expect(response.status).toBe(200);
  });
});
