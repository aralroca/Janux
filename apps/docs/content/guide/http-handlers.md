# HTTP handlers & uploads

Beyond pages and `api()` RPC, a real app needs arbitrary HTTP endpoints: REST routes, webhooks, OAuth authorization-server endpoints, `.well-known` documents, SSO callbacks, file downloads. Janux serves these from a `src/api/**` tree.

## Route handlers

A file under `src/api` exports functions named by HTTP method, each returning a Web `Response`:

```ts
// src/api/healthcheck.ts        →  /api/healthcheck
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

Handlers and form actions read multipart bodies with the platform API:

```ts
// src/api/upload.ts
export async function POST({ req }) {
  const form = await req.formData();
  const file = form.get('file') as File;

  return Response.json({ name: file.name, size: file.size });
}
```

On the client, `dropzone()` wires drag-and-drop, paste and click-to-pick into a `File[]`:

```ts
import { dropzone } from 'janux/client';

const zone = dropzone({
  accept: ['image/*', 'application/pdf'],
  maxSize: 10 * 1024 * 1024,
  onFiles: (files) => upload(files),
});

zone.attach(el);          // in lifecycle.attach; returns a disposer
zone.open();              // open the native picker
zone.isOver.value;        // reactive drag-over state
```

## Streaming SSR (roadmap)

Component-property Suspense (`Comp.suspense = () => <Skeleton/>`) and out-of-order streaming are on the roadmap. Today, async data reaches the UI through the reactive client cache (`useQuery`, see [Data cache](/docs/guide/data-cache)): the page ships instantly and data fills in reactively — no blocking SSR wait. Streaming SSR is a first-paint optimization tracked alongside the compiler work.
