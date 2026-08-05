---
title: Untrusted content — provenance API
description: "Marking content the app did not author, and the two pipeline rules that follow from it: untrustedFields, hasUntrusted, fenceUntrusted, originUnderTaint and guardUnderTaint. Guide: Prompt injection."
---

# Untrusted content — provenance API

The pieces behind the [prompt injection](/docs/guide/prompt-injection) model. Apps normally touch only the first two: `.untrusted()` on a schema field and `effect: 'irreversible'` on what cannot be undone. Everything else is what the framework uses to carry that declaration through the projections and enforce it in the pipeline — exported because the rules should be readable, and because a custom surface has to be able to apply them.

```ts
import { fenceUntrusted, guardUnderTaint, hasUntrusted, originUnderTaint, untrustedFields } from 'janux';
```

## Declaring it

### `.untrusted()`

A schema-field modifier. It declares that the field carries content the app did not author, and it is the only declaration an app writes for state:

```ts
import { schema, str } from 'janux';

const state = schema({ title: str(), body: str().untrusted() });
```

Validation is untouched — bounds, defaults, optionality and coercion all behave exactly as before. What changes is that the field's provenance travels: into the JSON Schema (`x-janux-untrusted: true`, so external MCP clients see it), into the manifest resource, into the live `ui://` resource read, and into the fence the page's Markdown projection puts around the island that renders it.

### `effect: 'irreversible'`

Declared on an `intent()` or an `api()`. It says running this cannot be undone — money moved, a message sent, a record deleted:

```ts
import { intent, schema, str } from 'janux';

const pay = intent({ effect: 'irreversible', input: schema({ amount: str() }), run: ({ input }) => charge(input) });
```

It changes nothing for an ordinary human or agent call. It is what a chain fed by untrusted content is measured against.

## Reading the declaration

### `untrustedFields(type)`

Every path in a schema whose content is untrusted, in declaration order. Lists use `[]` and objects use dots:

```ts
untrustedFields(schema({ replies: list({ body: str().untrusted() }) })); // ['replies[].body']
```

### `hasUntrusted(type)`

Whether anything in the schema is untrusted — the question a projection asks before it decides to fence.

## Delimiting it

### `fenceUntrusted(content, provenance)`

Wraps text in a nonce-delimited block naming where it came from. `provenance` is `{ source, from? }`, where `source` is `'user-input'`, `'remote-mcp'` or `'attachment'`, and `from` is the resource uri, remote tool name or attachment ref:

```ts
fenceUntrusted(comment, { source: 'user-input', from: 'ui://thread' });
```

The id is generated per call. A fixed marker would let a payload close its own fence and continue as trusted prose; an unguessable one cannot be forged, and nothing in the content is stripped or rewritten to make that hold.

Reach for it when your app puts untrusted text in front of a model itself — text extracted from an attachment, a record pulled from a third-party API. The framework already fences what it projects.

## The pipeline rules

Both are pure functions, applied inside `invokeIntent` and `invokeApi` before anything else reads either value. They are exported so a custom agent surface can apply the same rules rather than invent its own.

### `originUnderTaint(origin, tainted?)`

Returns `'agent'` for a tainted chain, and the origin unchanged otherwise. Provenance does not launder: `'human'` means a person drove the call, and a chain fed by a stranger's text has no person behind it.

### `guardUnderTaint(guard, effect, tainted?)`

Returns `'confirm'` when the chain is tainted, the effect is `'irreversible'` and the guard resolved to `'auto'`. Every other combination is returned unchanged — only `auto` moves, and only upwards, so a call that is already gated stays exactly as gated.

## Carrying it across a boundary

Taint travels with the call, like the origin.

- **In the browser**, `janux.call(tool, input, { tainted })` — the agent turn's `ui_calls` envelope carries `tainted: true` when the turn read untrusted content, and the bridge passes it into the pipeline.
- **Over HTTP**, the `x-janux-tainted: 1` request header on `/_janux/api/*`. Declaring it only ever costs the caller: it pins the origin to `agent`.
- **Inside the agent loop**, it is tracked for you — a remote MCP result taints the rest of the turn, and so does a tool result read back from a page that mounts untrusted state.

Related: [Prompt injection](/docs/guide/prompt-injection) · [Intents and guards](/docs/guide/intents-and-guards) · [Agent guardrails](/docs/reference/agent-guardrails)
