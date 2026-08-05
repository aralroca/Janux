import type { ChannelDef } from '@janux/server';
import { refuse, verifyEd25519 } from './signature';

/**
 * Discord, without the Discord SDK.
 *
 * An interaction is an Ed25519-signed JSON POST whose reply rides the same
 * response, so a slash command finishes inside the request Discord opened — no
 * gateway socket, no bot process holding a connection. Set the application's
 * Interactions Endpoint URL to `/_janux/channels/<name>` and register one
 * command with a string option; its value is what the human asked.
 *
 * Discord verifies the endpoint by PINGing it before it will save the URL, and
 * keeps doing so afterwards. That handshake is answered here, so it never
 * reaches the model.
 */

export interface DiscordChannelOptions {
  /** General Information → Public Key, as Discord prints it (hex). */
  publicKey: string;
}

const PING = 1;
const COMMAND = 2;
const CHANNEL_MESSAGE = 4;
/** Discord's `EPHEMERAL` message flag: visible only to the person who asked. */
const EPHEMERAL = 64;

interface Interaction {
  type?: number;
  channel_id?: string;
  data?: { options?: { value?: unknown }[] };
}

/** The first string option of the command — the question, whatever it was named. */
function questionOf(interaction: Interaction): string {
  const option = (interaction.data?.options ?? []).find((candidate) => typeof candidate?.value === 'string');

  return typeof option?.value === 'string' ? option.value.trim() : '';
}

export function discordChannel({ publicKey }: DiscordChannelOptions): ChannelDef {
  return {
    async receive(req) {
      if (req.method !== 'POST') return refuse(405, 'method_not_allowed');
      if (!publicKey) return refuse(503, 'channel_unconfigured');
      const body = await req.text();
      const message = (req.headers.get('x-signature-timestamp') ?? '') + body;

      if (!(await verifyEd25519(publicKey, req.headers.get('x-signature-ed25519') ?? '', message))) return refuse(401, 'bad_signature');
      const interaction = JSON.parse(body) as Interaction;

      if (interaction.type === PING) return Response.json({ type: PING });
      if (interaction.type !== COMMAND) return undefined;
      const text = questionOf(interaction);

      return text === '' ? undefined : { text, threadId: `discord:${interaction.channel_id ?? 'unknown'}` };
    },
    send: ({ text, error }) => Response.json({ type: CHANNEL_MESSAGE, data: { content: text, ...(error && { flags: EPHEMERAL }) } }),
  };
}
