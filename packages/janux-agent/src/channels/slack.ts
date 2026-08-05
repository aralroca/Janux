import type { ChannelDef } from '@janux/server';
import { constantTimeEquals, hmacSha256Hex, refuse } from './signature';

/**
 * Slack, without the Slack SDK.
 *
 * A slash command is a signed form POST that accepts its answer on the same
 * response, which is why it — and not the Events API — is what this adapter
 * speaks: the turn finishes inside the request Slack already opened, so there
 * is no bot token, no outbound client and no delivery queue. Point a command's
 * Request URL at `/_janux/channels/<name>` and that is the whole setup.
 *
 * Anything beyond that (posting unprompted, threads, reactions) is a Slack app,
 * not a Janux channel; the app can build one and call the same webhook.
 */

export interface SlackChannelOptions {
  /** Basic Information → App Credentials → Signing Secret. */
  signingSecret: string;
  /** How old a signed request may be. Default 300s, which is Slack's own guidance. */
  toleranceSeconds?: number;
}

/**
 * Slack's v0 scheme over the raw body, plus the age check that makes a captured
 * request stop working — without it a valid signature is valid forever.
 */
async function verified(secret: string, req: Request, body: string, tolerance: number): Promise<boolean> {
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));

  if (timestamp === '' || !Number.isFinite(age) || age > tolerance) return false;

  return constantTimeEquals(req.headers.get('x-slack-signature') ?? '', `v0=${await hmacSha256Hex(secret, `v0:${timestamp}:${body}`)}`);
}

export function slackChannel({ signingSecret, toleranceSeconds = 300 }: SlackChannelOptions): ChannelDef {
  return {
    async receive(req) {
      if (req.method !== 'POST') return refuse(405, 'method_not_allowed');
      if (!signingSecret) return refuse(503, 'channel_unconfigured');
      const body = await req.text();

      if (!(await verified(signingSecret, req, body, toleranceSeconds))) return refuse(401, 'bad_signature');
      const form = new URLSearchParams(body);
      const text = (form.get('text') ?? '').trim();

      // One thread per Slack channel: the conversation a team sees is the
      // conversation the agent remembers.
      return text === '' ? undefined : { text, threadId: `slack:${form.get('channel_id') ?? 'unknown'}` };
    },
    // A refusal is between the bot and whoever asked; an answer belongs to the
    // channel that asked for it.
    send: ({ text, error }) => Response.json({ response_type: error ? 'ephemeral' : 'in_channel', text }),
  };
}
