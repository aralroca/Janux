---
title: Resumable agent streams
description: "Keep a streamed copilot answer when the connection does not survive it: a reload, a dropped network or a second tab picks the turn up from the last event it received. Guide: The agent and your copilot."
---

# Resumable agent streams

A streamed turn normally dies with its socket: reload the page mid-answer and the answer is gone, along with the tokens already paid for. Turning on retention makes the turn outlive the connection that started it, so a reader that comes back is owed only the part it missed. Guide: [The agent and your copilot](/docs/guide/agent-and-copilot).

```ts
import { defineAgent } from '@janux/agent';
import { serverLlm } from '@janux/agent/local';
```

## Turning it on

Retention is opt-in on the agent, and the browser has to ask for it too — the mount holding a turn is useless if the reader never comes back for it.

```ts
// src/agent.ts
export default defineAgent({
  harness: { resumableStreams: true },
});
```

```ts
// in the page
const llm = serverLlm({ stream: true, resume: true });
```

`resumableStreams: true` takes the defaults; an object tunes them:

| `ResumableStreamsConfig` | Default | What it does |
|---|---|---|
| `ttlMs` | `60_000` | How long a turn stays replayable after its last frame |
| `maxBytes` | `262_144` | Per-turn retention cap; past it the payload is dropped |
| `now` | `Date.now` | Injectable clock, for deterministic tests |

It is **off by default on purpose**. A retained turn runs to completion even when nobody is reading it — that is exactly what makes resuming possible, and it is a bill the app has to choose to pay.

## The three ways a reader loses a stream

| What happened | What the reader does | What it gets |
|---|---|---|
| The network dropped | Reconnects with the last `id:` it received | Only the frames after it |
| The page reloaded | `resumeInterrupted()` on the next load | The turn replayed from the start |
| A second tab opened | `resumeInterrupted()`, same origin | The same turn, from the start, live |

The distinction is not fussiness: a dropped socket leaves the text already painted on the screen, so re-sending it would duplicate it. A reload leaves nothing, so replaying the whole turn *is* continuing it.

```ts
// Nothing in flight resolves `undefined`, which is the answer on most page loads.
const carried = await llm.resumeInterrupted();
```

The in-flight stream id lives in `localStorage` (that is what a second tab can see), and it is removed as soon as the turn ends. Everything else — the cursor — stays in memory, because it only means something to a page that still has the text.

| `ResumeOptions` | Default | What it does |
|---|---|---|
| `storage` | `localStorage` | Where the in-flight stream id is shared |
| `key` | `'janux:llm-stream'` | The entry to keep it under |
| `retryMs` | `400` | Pause before a reconnection attempt |
| `attempts` | `3` | Reconnections before the turn is given up on |

Only *progress* buys back an attempt: a mount that keeps replaying the same prefix without getting past it is retried a bounded number of times, not forever.

## What the wire looks like

Every streamed frame already carries an incremental `id:`, and the response carries `x-janux-stream-id`. Resuming names that id and the last event received:

```
POST /_janux/llm?stream=<id>
Last-Event-ID: 41
```

`POST`, even though it reads rather than writes. `/_janux/llm` is an invocation path, and Janux keeps those closed to cross-origin `GET`s on purpose — an answer being written for a signed-in visitor is exactly what must not be readable by an `<img>`, a `<script>` or an `EventSource` on somebody else's page. Resuming goes through the same door as every other call rather than carving an exception into that rule.

| Answer | When |
|---|---|
| `200` + the remaining frames | The turn is yours and still retained |
| `404 stream_not_found` | Unknown, expired — **or owned by someone else** |
| `422 stream_not_resumable` | It outgrew `maxBytes`, or retention is off |

A stream belonging to another identity answers exactly like one that never existed. The id is a guess either way, and only one of those two answers is safe to confirm.

Worth being precise about what "another identity" means: without [`identityFor`](/docs/reference/agent-guardrails) every caller is `anonymous`, so ownership rests entirely on the stream id being an unguessable UUID. That is the right trade for a public docs copilot and the wrong one for anything a user signs in to — if answers are private, resolve an identity, and the ownership check becomes a real one.

## Resuming is not a way around the limits

A resume runs the same gate as every other request to the mount: `identityFor` resolves the caller, and [`rateLimit`](/docs/reference/agent-rate-limit) counts it. Replaying is cheaper than generating, but a door that skipped the limiter would simply become the door everyone uses.

Retention is bounded in both directions, so an abandoned turn cannot pin memory: it expires after `ttlMs`, and a turn that outgrows `maxBytes` has its payload dropped and stops being replayable. Neither ever truncates the live reader — the only thing given up is the *ability to replay*.

## One instance holds the turn

The log lives in the process that is generating the turn. That is the whole of it — a turn is seconds long and a few KiB, and writing every delta to a database would cost more than the answer.

The consequence is worth stating plainly: **behind a load balancer, a resume that lands on a different instance finds nothing**. It answers `404`, the client stops asking and forgets the stream, and the reader loses the answer exactly as it would have without any of this — no duplicate turn, no error, no wedged page. So this degrades to today's behavior rather than breaking, but on a multi-instance deployment it only helps when the resume happens to come home. Session affinity is what makes it reliable there; a shared log would be the other answer, and `createResumableStreams` is the seam it would go behind.

## createResumableStreams(config)

The retention log itself, should you want to drive it directly (the mount builds its own from `harness.resumableStreams`):

```ts
import { createResumableStreams } from '@janux/agent';

const streams = createResumableStreams({ ttlMs: 30_000 });
```

| Method | Signature | Notes |
|---|---|---|
| `open` | `(streamId, owner) => void` | Starts retaining a turn; `owner` is the only identity that may resume it |
| `append` | `(streamId, frame) => void` | `StreamFrame` is `{ id, chunk }` |
| `close` | `(streamId) => void` | Ends the turn; parked followers are released |
| `resume` | `(streamId, owner, cursor) => AsyncGenerator<StreamFrame> \| ResumeFailure` | Frames after `cursor`, live until the producer closes |
| `retained` | `(streamId) => number` | Bytes currently held; `0` once dropped or forgotten |

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [Agent rate limiting](/docs/reference/agent-rate-limit) · [Agent memory & storage](/docs/reference/agent-memory)
