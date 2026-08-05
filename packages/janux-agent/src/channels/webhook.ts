import type { ChannelDef, ChannelMessage } from '@janux/server';
import { constantTimeEquals, refuse } from './signature';

/**
 * The plain HTTP channel: a bearer, a JSON body, a JSON answer.
 *
 * It is the transport with nobody else in it — no account, no app to register,
 * no signature scheme to reproduce — so it is what you reach for to try a
 * channel against a local `janux dev`, and what an internal system (a cron, a
 * support tool, another service) uses when there is no chat product involved.
 *
 *     curl -X POST localhost:3000/_janux/channels/webhook \
 *       -H "authorization: Bearer $JANUX_WEBHOOK_SECRET" \
 *       -d '{"text":"how many orders are pending?"}'
 */

export interface WebhookChannelOptions {
  /**
   * The bearer every caller must present. An unset secret refuses everyone:
   * declaring a door that spends model budget is promising to hold its key.
   */
  secret: string;
}

interface WebhookBody {
  text?: unknown;
  threadId?: unknown;
  path?: unknown;
}

function messageOf(body: WebhookBody): ChannelMessage | undefined {
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (text === '') return undefined;

  return {
    text,
    ...(typeof body.threadId === 'string' && { threadId: body.threadId }),
    ...(typeof body.path === 'string' && { path: body.path }),
  };
}

export function webhookChannel({ secret }: WebhookChannelOptions): ChannelDef {
  return {
    async receive(req) {
      if (req.method !== 'POST') return refuse(405, 'method_not_allowed');
      if (!secret) return refuse(503, 'channel_unconfigured');
      const presented = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');

      if (!constantTimeEquals(presented, secret)) return refuse(401, 'unauthorized');

      return messageOf((await req.json().catch(() => ({}))) as WebhookBody);
    },
    send: (reply) => Response.json(reply),
  };
}
