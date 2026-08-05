---
title: Channels
description: "Inbound surfaces for the same agent: a file per channel under src/channels, one loop behind all of them, and a tool surface that degrades honestly when there is no browser to drive."
---

# Channels

The copilot lives on the page. A **channel** is the same agent reached from somewhere else — a Slack command, a Discord interaction, an HTTP webhook from a service that has no UI at all.

The word to be suspicious of there is *same*. It would be easy to grow a second agent for the outside world: its own loop, its own tool list, its own idea of what a caller may do. That is two products, and the second one is where the permissions quietly disagree with the first. So a channel in Janux is deliberately small — a **transport adapter**, nothing more:

```ts
// src/channels/webhook.ts  →  /_janux/channels/webhook
import { webhookChannel } from '@janux/agent';

export default webhookChannel({ secret: process.env.JANUX_WEBHOOK_SECRET! });
```

That file is the entire declaration. Channels are discovered exactly like routes, skills and schedules: the filesystem is the truth, `src/channels/ops/inbox.ts` is the channel `ops/inbox`, and a leading `_` marks shared code rather than a channel. There is no registry to keep in sync.

## What a channel is, and is not

A channel answers two questions and stays out of the way of everything between them:

```ts
import { defineChannel } from '@janux/agent';

export default defineChannel({
  // The transport's request → a turn, a ready Response, or nothing.
  receive: async (req) => ({ text: ((await req.json()) as { text: string }).text }),
  // The finished turn → the transport's response.
  send: (reply) => Response.json(reply),
});
```

Everything in the middle is the ordinary agent turn: the same mount, over the same `AgentDeps`, so the same [guards](/docs/guide/intents-and-guards) decide what may run. That is not a convenience — it is the fourth [design invariant](/docs/guide/architecture-and-roadmap). A channel that enforced permissions of its own would be a second invocation pipeline, and the first forged call through it would be indistinguishable from a real one. A `confirm` guard parks on a webhook exactly as it parks in the browser.

`receive` has two answers that never cost a model turn, which is what lets one shape cover every transport:

- a **`Response`** — a handshake (Discord PINGs the endpoint before it will save the URL) or a refusal (a signature that did not verify);
- **nothing** — an event that carries no message, answered `204`.

## No browser, and saying so

Half of the agent's surface only exists in a page. `ui_navigate`, `ui_click`, and the intents your own components declare are executed by the client — and on a webhook the client is nobody.

Pretending otherwise fails in the worst way: the model calls a tool, nothing happens, and it reports back that it did the thing. So on a channel turn Janux does two things instead.

**The tools are not offered.** What remains is what the server answers itself: `api.*`, [skills](/docs/guide/skills), [subagents and handoffs](/docs/reference/agent-subagents), and any [outbound MCP](/docs/reference/agent-mcp-client) tools. The partition is the same one the loop dispatches on, so the surface that is offered and the surface that can execute cannot drift apart.

**The model is told what is missing, by name.** The system prompt gains a line naming the channel and listing every withheld tool, so a copilot that cannot open the cart page says so, rather than inventing a way to have used it:

> This turn arrives over the "webhook" channel, not a browser: there is no page to read, click or navigate. Not available here: incident-board.focus, ui_navigate, ui_click, … Calling one of them runs nothing.

And if it reaches for one anyway, the call comes back as a result it can recover from — `tool_unavailable_on_channel`, naming the tool and the channel — never a failed call, and never a `ui_calls` envelope no webhook will ever execute.

## The three adapters

All three ship in core and none of them pulls in a vendor SDK: Slack signs with HMAC-SHA256 and Discord with Ed25519, both of which are in WebCrypto.

| Adapter | Transport | To try it |
| --- | --- | --- |
| `webhookChannel({ secret })` | Bearer + JSON, in and out | `curl`, no account |
| `slackChannel({ signingSecret })` | Slash command (signed form POST) | A Slack app's Request URL |
| `discordChannel({ publicKey })` | Interactions endpoint (Ed25519) | A Discord app's Interactions URL |

Each answers on the request the platform already opened, so there is no bot token, no outbound client, no gateway socket and no delivery queue to operate. That is the line: anything that needs to speak *unprompted* is a Slack or Discord app, and it can call your webhook like any other service.

The secret is required, and an unset one refuses every caller — declaring a door that spends model budget is promising to hold its key.

## Authentication and identity

A channel authenticates the *transport* (a signature, a bearer). Who the caller is inside your app is still `ctxFor` and `harness.identityFor`, and both see the real inbound request — headers included — so a Slack signature or a webhook bearer can be turned into an identity the same way a session cookie is.

Note that `/_janux/channels/*` is deliberately outside the [CSRF](/docs/recipes/csp) surface, for the same reason `/_janux/mcp` is: a webhook proves itself with a signature it computed, not with an ambient cookie and an `Origin` header it cannot send.

## Try it

[`examples/with-channels`](https://github.com/aralroca/Janux/tree/main/examples/with-channels) is an on-call desk answering on both doors, with a `confirm`-guarded tool and a browser-only intent — no third-party account needed.
