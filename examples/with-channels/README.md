# with-channels

One agent, two doors: the browser copilot and an HTTP webhook, running the same
loop over the same invocation pipeline.

```bash
bun install
JANUX_WEBHOOK_SECRET=dev-secret bun --filter janux-example-with-channels dev
```

Then ask it something from outside the browser — no third-party account, no
tunnel, no bot to register:

```bash
curl -X POST localhost:4344/_janux/channels/webhook \
  -H "authorization: Bearer dev-secret" \
  -d '{"text":"what is on the board?"}'
```

## What the example shows

`src/channels/webhook.ts` is the whole declaration. The filesystem names the
channel, the same way `src/routes/`, `src/skills/` and `src/schedules/` name
what they hold, and `/_janux/channels/webhook` is served from it.

There is no second runtime behind that door. The turn is the ordinary agent
turn, which is what makes the two interesting properties fall out rather than
having to be re-implemented:

- **The same guards.** `api.oncall.page_engineer` is `confirm`, so an agent
  asking for it gets a proposal a human approves — on the webhook exactly as in
  the browser. A channel cannot be the laxer door, because it is not a door of
  its own.
- **An honest surface.** `ui_*` and the board's own `focus` intent need a page
  to act on, and a webhook has none. They are not offered, and the model is told
  which ones they were by name; if it reaches for one anyway it gets a result
  saying so, not a call that fails or an envelope nobody will execute.

## Files

| File | What it is |
| --- | --- |
| `src/channels/webhook.ts` | The channel. A bearer, a JSON body, a JSON answer. |
| `src/agent.ts` | The agent — with nothing channel-specific in it. |
| `src/server/oncall.api.ts` | Server tools, one of them `confirm`-guarded. |
| `src/components/IncidentBoard.tsx` | The board, and the browser-only `focus` intent. |

## Slack and Discord

The same file would be `slackChannel({ signingSecret })` or
`discordChannel({ publicKey })` — both verify signatures with WebCrypto and
answer on the request the platform already opened, so neither pulls in a vendor
SDK. They need an account to try, which is why this example uses the webhook.
See [the channels guide](https://janux.build/docs/guide/channels).
