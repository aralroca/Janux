---
"@janux/agent": minor
---

Resumable streams: a copilot answer now survives losing the connection that was carrying it.

A streamed turn used to die with its socket. Reload the page mid-answer and the answer was gone — along with the tokens already paid for it — because a departed reader cancelled the provider on the way out. That is the right default when nobody is left to read the turn; it is the wrong one when somebody is about to come back for it.

The wire never needed changing: every frame has carried an incremental `id:` and every streamed response an `x-janux-stream-id` since streaming landed. What was missing was retention on one side and a reader that returns on the other.

`harness.resumableStreams` turns retention on. Each turn gets a bounded log, the pump writes every numbered frame to it, and a reader walking away no longer ends the generation — finishing the turn is precisely what a resume comes back for. `POST /_janux/llm?stream=<id>` with `Last-Event-ID` replays the remainder. It is a POST although it only reads, because `/_janux/llm` is an invocation path and Janux keeps those closed to cross-origin `GET`s: an answer being written for a signed-in visitor is exactly what must not be readable by an `EventSource` on another origin.

Resuming is not a way around anything. It runs the same gate as every other request — `identityFor` resolves the caller and `rateLimit` counts it — because a cheaper door becomes the only door anyone uses. A stream belonging to another identity answers exactly like one that never existed; the id is a guess either way, and only one of those answers is safe to confirm. Retention is bounded in both directions (60s TTL, 256 KiB per turn by default), and neither bound ever truncates the live reader — the only thing given up is the ability to replay.

On the client, `serverLlm({ resume: true })` treats the three ways a reader loses a stream as the three different losses they are. A dropped network leaves the text already painted on screen, so it asks for what follows its cursor. A reload or a second tab has nothing on screen at all, so `resumeInterrupted()` replays the turn from the beginning — replaying *is* continuing there. Only the stream id is shared across the origin (which is what lets a second tab find it); the cursor stays in memory, where it means something. Frames the reader already has are dropped on arrival, so "exactly once" does not depend on the other side getting an off-by-one right.

The docs copilot at [janux.build](https://janux.build) runs it: reload while it is answering and the answer carries on.
