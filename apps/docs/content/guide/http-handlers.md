---
title: HTTP handlers & uploads
description: Arbitrary HTTP endpoints beside your pages and RPC — REST routes, webhooks, well-known documents, uploads — as files under src/api.
---

# HTTP handlers & uploads

Beyond pages and `api()` RPC, a real app needs arbitrary HTTP endpoints: REST routes, webhooks, OAuth authorization-server endpoints, `.well-known` documents, SSO callbacks, file downloads. Janux serves these from a `src/api/**` tree.

## Route handlers

A file under `src/api` exports functions named by HTTP method, each returning a Web `Response`:

```ts title="src/api/healthcheck.ts"
// →  /api/healthcheck
export function GET() {
  return Response.json({ status: 'Healthy' });
}

// src/api/orders/[id].ts        →  /api/orders/:id
export function GET({ params }) {
  return Response.json({ id: params.id });
}

// src/api/webhooks/stripe.ts    →  /api/webhooks/stripe
export async function POST({ req }) {
  const event = await req.json();
  // …
  return new Response(null, { status: 204 });
}
```

- Mounted at `/api` by default; the file tree uses the **same segment grammar as pages** (`[id]`, `[id=matcher]`, `[...rest]`, `[[...rest]]`).
- Each handler receives `{ req, params, ctx, url }`. `ctx` is the same per-request context pages get (auth identity included).
- An undeclared method returns `405` with an `Allow` header; `HEAD` falls back to `GET`.
- Handlers return a `Response`, so streaming bodies, redirects, content negotiation and custom status/headers are all just standard web APIs.

This is the surface for everything the `/_janux/*` RPC layer doesn't cover — including acting as an **OAuth 2.1 authorization server** (`/api/auth/oauth-authorize`, `/oauth-token`, `/introspect`, `.well-known` metadata) and SAML/SSO callbacks.

## File uploads

Handlers and form actions read multipart bodies with the platform API. Bare `req.formData()` buffers the **whole** body before your code sees a byte, so guard uploads with `formDataWithin`: an oversized body 413s from `content-length` before being consumed — and a chunked body without one is cut mid-stream the moment it crosses the limit:

```ts title="src/api/upload.ts"
import { formDataWithin, matchesType } from '@janux/server';

const MAX_BODY_BYTES = 1024 * 1024;

export async function POST({ req }) {
  const form = await formDataWithin(req, MAX_BODY_BYTES);

  if (form instanceof Response) return form; // 413, body never buffered past the limit
  const file = form.get('file') as File;

  // Magic bytes, not the declared type: a .txt renamed to .png fails here.
  if (!(await matchesType(file, ['image/*']))) return Response.json({ error: 'images only' }, { status: 415 });

  return Response.json({ name: file.name, size: file.size });
}
```

- `rejectOversized(req, maxBytes)` is the standalone early guard — `null` or a 413 `Response` from `content-length` alone, for handlers that stream the body themselves.
- `readBodyWithin(req, maxBytes)` reads any body (JSON, raw bytes) under the same protection.
- `matchesType(file, accept)` trusts only the file's magic bytes (via `sniffContentType(bytes)`, covering png, jpeg, gif, webp, pdf and zip) — `file.type` is caller-supplied fiction.

### Gigabyte uploads: spool to disk

`formDataWithin` never buffers *past* the limit, but it does buffer *within* it — fine for megabytes, not for a 4 GB video. `spoolMultipart` parses the body **as it arrives** and writes every file part straight into a per-request temp directory, so the same upload costs one chunk of memory instead of its whole size:

```ts title="src/api/video.ts"
import { acceptsType, spoolMultipart } from '@janux/server';

export async function POST({ req }) {
  const form = await spoolMultipart(req, { maxBytes: 4 * 1024 ** 3 });

  if (form instanceof Response) return form; // 413 over the limit, 400 malformed
  try {
    const file = form.file('video');

    if (!file) return Response.json({ error: 'field "video" is required' }, { status: 400 });
    // `sniffed` is what the first bytes really are — read while they streamed past.
    if (!acceptsType(file.sniffed, ['video/*'])) return Response.json({ error: 'video only' }, { status: 415 });
    await file.moveTo(`/var/uploads/${crypto.randomUUID()}`);

    return Response.json({ name: file.name, size: file.size, title: form.fields.title });
  } finally {
    await form.cleanup(); // whatever `moveTo` did not claim
  }
}
```

- `form.files` are `SpooledFile`s — `field`, `name`, `type` (declared), `sniffed` (real), `size`, `path` and `moveTo(destination)`, which renames and falls back to a copy across filesystems.
- `form.fields` holds the non-file parts, decoded as UTF-8. Those *do* stay in memory, so each one is capped at 1 MB.
- The 413 still fires from `content-length` before a byte is read, and again mid-stream for a chunked body; either way the spool directory is removed before the response returns.
- `cleanup()` is yours to call — the temp directory outlives the handler otherwise.

On the client, `dropzone()` wires drag-and-drop, paste and click-to-pick into a `File[]`, and `zone.upload()` posts them back with per-file progress:

```ts
import { dropzone } from 'janux/client';

const zone = dropzone({
  accept: ['image/*', 'application/pdf'],
  maxSize: 10 * 1024 * 1024,
  onFiles: (files) => zone.upload('/api/upload', files),
  onProgress: ({ file, sent, total }) => render(file.name, Math.round((sent / total) * 100)),
});

zone.attach(el);          // in lifecycle.attach; returns a disposer
zone.open();              // open the native picker
zone.isOver.value;        // reactive drag-over state
```

## Streaming SSR (roadmap)

Component-property Suspense (`Comp.suspense = () => <Skeleton/>`) and out-of-order streaming are on the roadmap. Today, async data reaches the UI through the reactive client cache (`useQuery`, see [Data cache](/docs/guide/data-cache)): the page ships instantly and data fills in reactively — no blocking SSR wait. Streaming SSR is a first-paint optimization tracked on the [roadmap](/docs/guide/architecture-and-roadmap), next to the one rendering piece still open there — a fine-grained list primitive.
