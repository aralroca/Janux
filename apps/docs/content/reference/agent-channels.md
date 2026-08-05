---
title: Channels API
description: "defineChannel, webhookChannel, slackChannel and discordChannel: the transport adapters that mount the same agent at /_janux/channels/<name>, and the server seam behind them."
---

# Channels API

Inbound surfaces for the embedded agent. The concept and the reasoning are in [the channels guide](/docs/guide/channels); this page is the surface.

Every file under `src/channels/` is a channel named by its relative path, served at `/_janux/channels/<name>`. `_`-prefixed files are shared code.

## `defineChannel`

```ts
import { defineChannel } from '@janux/agent';

export default defineChannel({
  receive: async (req) => ({ text: ((await req.json()) as { text: string }).text, threadId: 'ops' }),
  send: (reply) => Response.json(reply),
});
```

Identity at runtime, like `defineSchedule` — it exists to type the object. A channel implements `ChannelDef`:

| Member | Type | What it does |
| --- | --- | --- |
| `receive` | `(req) => ChannelMessage \| Response \| undefined` | Parses the transport. A `Response` answers it directly (handshake, rejected signature); `undefined` ignores the event with a `204`. Both skip the model entirely. |
| `send` | `(reply: ChannelReply) => Response` | Renders the finished turn for the transport. |

`ChannelMessage` is `{ text, threadId?, path? }` — `threadId` keys [harness memory](/docs/reference/agent-memory), `path` chooses the page whose manifest frames the turn (default `/`).

`ChannelReply` is `{ text, threadId?, error?, detail? }`. `error` is set when the turn ended in a guardrail refusal, a provider failure or missing model setup, so a transport can style it differently. `detail` carries the provider's own words when there are any — it travels so an operator can diagnose without reading server logs, and it is separate from `text` precisely so a chat transport can show the sentence and not the stack: `slackChannel` and `discordChannel` render `text` alone.

## `webhookChannel`

```ts
import { webhookChannel } from '@janux/agent';

export default webhookChannel({ secret: process.env.JANUX_WEBHOOK_SECRET! });
```

Bearer in, JSON out — the transport with no third party in it.

```bash
curl -X POST localhost:3000/_janux/channels/webhook \
  -H "authorization: Bearer $JANUX_WEBHOOK_SECRET" \
  -d '{"text":"how many orders are pending?","threadId":"ops-1"}'
```

| Option | Type | Notes |
| --- | --- | --- |
| `secret` | `string` | Required in `authorization: Bearer`. Unset ⇒ every caller gets `503 channel_unconfigured`. |

Accepts `{ text, threadId?, path? }`; answers `{ text, threadId?, error? }`. A non-`POST` is `405`, a wrong bearer `401`, and an empty `text` is ignored with `204`.

## `slackChannel`

```ts
import { slackChannel } from '@janux/agent';

export default slackChannel({ signingSecret: process.env.SLACK_SIGNING_SECRET! });
```

Speaks **slash commands**: a signed form POST that takes its answer on the same response, so there is no bot token and no outbound client. Point a command's Request URL at `/_janux/channels/<name>`.

| Option | Type | Notes |
| --- | --- | --- |
| `signingSecret` | `string` | Basic Information → App Credentials. |
| `toleranceSeconds` | `number` | How old a signed request may be. Default `300`, Slack's own guidance. |

Verifies Slack's `v0` HMAC-SHA256 over the raw body and rejects requests older than the tolerance, so a captured request stops working. Threads by Slack channel (`slack:C123`). Answers `in_channel`, or `ephemeral` when the reply carries an `error`.

## `discordChannel`

```ts
import { discordChannel } from '@janux/agent';

export default discordChannel({ publicKey: process.env.DISCORD_PUBLIC_KEY! });
```

Speaks the **interactions endpoint**: an Ed25519-signed JSON POST answered on the same response — no gateway socket, no bot process.

| Option | Type | Notes |
| --- | --- | --- |
| `publicKey` | `string` | General Information → Public Key, hex. |

Answers Discord's `PING` handshake itself, so verifying the endpoint never reaches the model. Takes the question from the command's first string option, threads by Discord channel (`discord:C77`), and replies as a channel message — flagged ephemeral when the reply carries an `error`.

## Server seam

Exported from `@janux/server` for hosts that wire their own server ([custom server](/docs/recipes/custom-server)); `janux dev` and `janux start` do this for you.

| Export | Signature | What it is |
| --- | --- | --- |
| `CHANNELS_PREFIX` | `'/_janux/channels/'` | The mount prefix. |
| `channelOf` | `(pathname) => string \| undefined` | The channel name in a path, if it is one. |
| `handleChannel` | `(req, name, channel, agent, deps) => Promise<Response>` | One request end to end: `receive`, the ordinary agent turn, `send`. |

`ServerOptions.channels` is `Record<string, ChannelDef>`. The mount runs `agent.handle` with the same `AgentDeps` the browser endpoint gets, which is what makes the guards identical on both doors.

## Discovery

Exported from `@janux/vite/config` for adapters and custom builds.

| Export | Signature |
| --- | --- |
| `channelFiles` | `(channelsDir) => string[]` |
| `channelName` | `(channelsDir, filePath) => string` |
| `channelServerOptions` | `(app, load) => Promise<ServerOptions['channels']>` |

## What a channel does not have

The client half of the tool surface — `ui_*` and your components' own intents — needs a browser. On a channel turn it is withheld, the system prompt names every withheld tool, and a call that reaches for one returns:

```json
{
  "error": "tool_unavailable_on_channel",
  "tool": "ui_navigate",
  "channel": "webhook",
  "message": "\"ui_navigate\" drives the browser UI and this turn is on the \"webhook\" channel, so nothing ran. …"
}
```

The turn continues from there, so it ends in a sentence the human can read rather than a call that failed under it.
