# with-channels

One agent, two doors: the browser copilot and an HTTP webhook, running the same
loop over the same invocation pipeline.

Put your own key in place of `sk-or-…` and run it from this folder:

```bash
export JANUX_WEBHOOK_SECRET=dev-secret OPENROUTER_API_KEY=sk-or-…
bun dev
```

Then ask it something from outside the browser — no third-party account, no
tunnel, no bot to register:

```bash
curl -X POST localhost:4344/_janux/channels/webhook \
  -H "authorization: Bearer dev-secret" \
  -d '{"text":"what is on the board?"}'
```

`export` rather than the `VAR=… bun dev` prefix on purpose: the prefix form only
holds when the whole thing is a single line, and a key long enough to wrap
usually is not — the variables stay in your shell and the server comes up
without them. Either way they go *before* `bun dev`, because they are read when
the modules load.

The secret is yours to pick and only has to match the `authorization: Bearer`
header. The provider key can be any of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY` or `OPENROUTER_API_KEY`. So each refusal names
the missing half: `503 channel_unconfigured` is the secret never reaching the
server, `401` is a bearer that does not match, and `{"error":"setup"}` is no
provider key — the turn still ran end to end.

One more, if a key you just set still reads as missing: another `janux dev` may
already own the port and be answering with its own environment.

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
