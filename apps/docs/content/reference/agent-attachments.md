# Agent attachments

Validating files a user sends to the copilot before they reach the model, and giving each one a stable reference the agent can talk about.

```ts
import { acceptAttachments, AttachmentError } from '@janux/agent';
```

## acceptAttachments(attachments, policy?)

```ts
try {
  const accepted = await acceptAttachments(incoming, { maxFiles: 2, allowedTypes: ['image/png'] });
  // accepted: [{ name, mediaType, data, ref: 'att_1', bytes: 12345 }, …]
} catch (error) {
  if (error instanceof AttachmentError) respondWith(error.code);
}
```

An `IncomingAttachment` is `{ name, mediaType, data }`, where `data` is either a base64 payload or a storage marker like `s3://…`. Accepted attachments come back with two extra fields:

| Field | What it is |
|---|---|
| `ref` | A stable `att_N` reference, **1-based**, in request order |
| `bytes` | Decoded size, computed from the base64 length (padding accounted for) |

The `ref` is the point: the model refers to `att_1` instead of carrying the payload around, so tool calls stay small and a file can be resolved server-side when it's actually needed.

## The policy and its defaults

| `AttachmentPolicy` | Default |
|---|---|
| `allowedTypes` | `['image/jpeg', 'image/png', 'image/webp', 'application/pdf']` |
| `maxFiles` | `4` |
| `maxFileBytes` | 10 MB |
| `maxRequestBytes` | 15 MB |

Two limits, on purpose: `maxFileBytes` stops one big file, `maxRequestBytes` stops many medium ones adding up. A policy you pass is merged over these defaults, so narrowing one field keeps the rest.

## AttachmentError

Thrown — not returned — with a machine-readable `code`:

| Code | Meaning |
|---|---|
| `too_many` | More files than `maxFiles` |
| `bad_type` | A `mediaType` outside `allowedTypes` |
| `too_big` | One file over `maxFileBytes` |
| `request_too_big` | The batch over `maxRequestBytes` |

Map the code to your HTTP response and to a message the user can act on. Rejection is **all-or-nothing**: a batch with one bad file is refused whole, so the model never sees a partially accepted upload and can't reason about a file that was dropped.

## Where it belongs

Call it at the edge — in the handler that receives the copilot request — *before* the turn is built, so an oversized or wrong-typed file never enters memory, never hits the provider and never gets stored. Pair it with [`dropzone`](/docs/reference/client-state) on the client, whose `accept`/`maxSize` should mirror this policy so users get instant feedback and the server stays the authority.

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [HTTP handlers & uploads](/docs/guide/http-handlers) · [Client state](/docs/reference/client-state)
