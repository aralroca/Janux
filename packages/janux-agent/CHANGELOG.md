# @janux/agent

## 0.7.0

### Minor Changes

- Resumable streams: a copilot answer now survives losing the connection that was carrying it.

  A streamed turn used to die with its socket. Reload the page mid-answer and the answer was gone — along with the tokens already paid for it — because a departed reader cancelled the provider on the way out. That is the right default when nobody is left to read the turn; it is the wrong one when somebody is about to come back for it.

  The wire never needed changing: every frame has carried an incremental `id:` and every streamed response an `x-janux-stream-id` since streaming landed. What was missing was retention on one side and a reader that returns on the other.

  `harness.resumableStreams` turns retention on. Each turn gets a bounded log, the pump writes every numbered frame to it, and a reader walking away no longer ends the generation — finishing the turn is precisely what a resume comes back for. `POST /_janux/llm?stream=<id>` with `Last-Event-ID` replays the remainder. It is a POST although it only reads, because `/_janux/llm` is an invocation path and Janux keeps those closed to cross-origin `GET`s: an answer being written for a signed-in visitor is exactly what must not be readable by an `EventSource` on another origin.

  Resuming is not a way around anything. It runs the same gate as every other request — `identityFor` resolves the caller and `rateLimit` counts it — because a cheaper door becomes the only door anyone uses. A stream belonging to another identity answers exactly like one that never existed; the id is a guess either way, and only one of those answers is safe to confirm. Retention is bounded in both directions (60s TTL, 256 KiB per turn by default), and neither bound ever truncates the live reader — the only thing given up is the ability to replay.

  On the client, `serverLlm({ resume: true })` treats the three ways a reader loses a stream as the three different losses they are. A dropped network leaves the text already painted on screen, so it asks for what follows its cursor. A reload or a second tab has nothing on screen at all, so `resumeInterrupted()` replays the turn from the beginning — replaying _is_ continuing there. Only the stream id is shared across the origin (which is what lets a second tab find it); the cursor stays in memory, where it means something. Frames the reader already has are dropped on arrival, so "exactly once" does not depend on the other side getting an off-by-one right.

  The docs copilot at [janux.build](https://janux.build) runs it: reload while it is answering and the answer carries on.

- Skills: procedures the model loads on demand. Drop a markdown file in `src/skills/` — `refund.md`, or `refund/SKILL.md` when it will grow siblings — with a `description` and, optionally, `when` to reach for it and the `tools` it uses. Frontmatter is validated by the same `schema()` that types component state.

  The split is the point. The index (name, description, when) rides in every manifest, small enough to always be in context; the body is fetched one at a time. The built-in copilot gets a `load_skill` tool for it, and external clients get the same contract over MCP, where the resource list is the index and `resources/read` on `janux://skill/<name>` is the body. Loading a skill is a read: it invokes nothing, and the tools a procedure describes are still called through the invocation pipeline with their guards.

  `janux verify` now holds a skill to the mounted tree. Every tool it declares in frontmatter, or writes down in its prose and worked examples, has to be a tool the app really has — otherwise the check fails, naming the skill and the file. A skill that names a tool nobody implemented is a mistake other frameworks can only find at runtime.

  See the [skills guide](https://janux.build/docs/guide/skills) and `examples/with-skills`.

- Prompt injection, contained in the pipeline instead of argued about in the prompt.

  Because the mounted tree _is_ the agent surface, untrusted content rendered into it goes straight into the model's context — a visitor's comment, an uploaded PDF, a remote MCP server's answer. Guardrail processors already cover what enters and leaves the model; this covers the half only the framework can, because the framework owns the invocation pipeline.

  Content is marked where it enters. `str().untrusted()` declares a state field fed by input the app did not author; everything the outbound MCP client returns and every attachment `acceptAttachments` accepts is untrusted by construction, with nothing to declare. The mark travels: into the JSON Schema (`x-janux-untrusted`), the manifest and `ui://` resources, and the per-page Markdown projection, where the island that renders it is fenced with a per-call nonce — a fixed delimiter is worthless, since a payload that writes its own closing tag would carry on as trusted prose.

  Then two invariants, enforced where guards already are, for clicks, bridge calls, MCP, A2A and HTTP alike. A chain that read untrusted content resolves to `origin: 'agent'` whatever it claims — without that, a poisoned chain could present itself as a person and walk past the approval it was meant to hit. And an intent or `api()` declaring `effect: 'irreversible'` degrades from `guard: 'auto'` to `'confirm'`, so it parks as a proposal a human settles. Guards only ever move upwards; `confirm` and `forbidden` are untouched.

  None of it is lexical — no wordlists, no classifiers, no filtering — so nothing here is defeated by rephrasing. `packages/conformance/security/prompt-injection.cases.ts` runs payloads from the OWASP LLM01 literature against every door from every source, and the false-positive rows sit beside them: a human click, an agent on a clean chain, an app that declares nothing untrusted and a reversible tool all stay exactly as unguarded as before.

  Also fixed: the proposal diff shadow-runs the intent body, which must never be why an irreversible body ran before anyone approved it. `dryRunDiff` now refuses an `effect: 'irreversible'` intent, as it already refused `server` ones.

  See the [prompt injection guide](https://janux.build/docs/guide/prompt-injection) and the [provenance API](https://janux.build/docs/reference/taint-api).

## 0.6.0

### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

## 0.5.0

### Minor Changes

- MCP specification 2026-07-28: the outbound client speaks the new era first and falls back to the old one.

## 0.4.0

Released with the framework; no changes of its own.
