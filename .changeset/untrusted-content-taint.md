---
"janux": minor
"@janux/server": minor
"@janux/agent": minor
---

Prompt injection, contained in the pipeline instead of argued about in the prompt.

Because the mounted tree *is* the agent surface, untrusted content rendered into it goes straight into the model's context — a visitor's comment, an uploaded PDF, a remote MCP server's answer. Guardrail processors already cover what enters and leaves the model; this covers the half only the framework can, because the framework owns the invocation pipeline.

Content is marked where it enters. `str().untrusted()` declares a state field fed by input the app did not author; everything the outbound MCP client returns and every attachment `acceptAttachments` accepts is untrusted by construction, with nothing to declare. The mark travels: into the JSON Schema (`x-janux-untrusted`), the manifest and `ui://` resources, and the per-page Markdown projection, where the island that renders it is fenced with a per-call nonce — a fixed delimiter is worthless, since a payload that writes its own closing tag would carry on as trusted prose.

Then two invariants, enforced where guards already are, for clicks, bridge calls, MCP, A2A and HTTP alike. A chain that read untrusted content resolves to `origin: 'agent'` whatever it claims — without that, a poisoned chain could present itself as a person and walk past the approval it was meant to hit. And an intent or `api()` declaring `effect: 'irreversible'` degrades from `guard: 'auto'` to `'confirm'`, so it parks as a proposal a human settles. Guards only ever move upwards; `confirm` and `forbidden` are untouched.

None of it is lexical — no wordlists, no classifiers, no filtering — so nothing here is defeated by rephrasing. `packages/conformance/security/prompt-injection.cases.ts` runs payloads from the OWASP LLM01 literature against every door from every source, and the false-positive rows sit beside them: a human click, an agent on a clean chain, an app that declares nothing untrusted and a reversible tool all stay exactly as unguarded as before.

Also fixed: the proposal diff shadow-runs the intent body, which must never be why an irreversible body ran before anyone approved it. `dryRunDiff` now refuses an `effect: 'irreversible'` intent, as it already refused `server` ones.

See the [prompt injection guide](https://janux.build/docs/guide/prompt-injection) and the [provenance API](https://janux.build/docs/reference/taint-api).
