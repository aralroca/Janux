# File uploads

A drag-and-drop image gallery showing the whole upload path end to end: `dropzone()` collects the files in the browser, a `src/api/**` handler receives the multipart body and enforces the contract, and the gallery is server-rendered from the same store agents read as a tool.

- **`dropzone()` client helper** — drag & drop, paste and click-to-pick in one call: `accept: ['image/*']` and `maxSize` filter files *before* your code ever sees them, `zone.isOver` styles the target reactively, `zone.open()` powers the "Choose files" button.
- **Multipart HTTP handler** — `POST /api/uploads` reads `req.formData()` with the platform API and re-enforces the shared contract (`src/limits.ts`): non-images get a `415`, oversized files a `413`, both with a JSON `error` — a raw HTTP caller cannot bypass what the dropzone filters client-side.
- **Server-rendered gallery** — the island's `source` resolves `uploads.list` during SSR, so the page arrives with the gallery already in the HTML; `refresh: onEvent('uploads.changed')` refetches after every upload, no reload.
- **Storage that fits each mode** — `.data/uploads/` on disk in dev (restart and your images are still there), pure memory under `NODE_ENV=test`; `GET /api/uploads/:id` serves the bytes back with their MIME type for the `<img>` tags.
- **Agentic surface** — `api.uploads.list` (the listing as a typed tool) and `gallery.refresh` are `auto`; `gallery.pick` is `forbidden` because a native file picker needs a human gesture. The upload byte-stream itself rides plain HTTP, the surface the manifest points agents at.

```bash
bun install
bun run dev   # http://localhost:4321
```

Both ends of the contract, side by side — the dropzone filters, the handler enforces:

```ts
import { dropzone } from 'janux/client';

const zone = dropzone({
  accept: ['image/*'],          // MIME list, wildcards supported
  multiple: true,
  maxSize: 1024 * 1024,         // oversized files are filtered out client-side
  onFiles: (files) => upload(files),
});

const detachZone = zone.attach(dropTarget); // drag & drop, paste, click-to-pick
zone.open();                                // open the native picker yourself
```

```ts
// src/api/uploads/index.ts → POST /api/uploads
export async function POST({ req }: { req: Request }) {
  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) return Response.json({ error: 'multipart field "file" is required' }, { status: 400 });
  if (!file.type.startsWith('image/')) return Response.json({ error: 'only images are accepted' }, { status: 415 });

  return Response.json(save(file), { status: 201 });
}
```

## Where things live

| File | What it shows |
|---|---|
| `src/limits.ts` | The shared upload contract: accepted types and max size, imported by both ends |
| `src/components/Gallery.tsx` | The island: `dropzone()` wired in `lifecycle.attach`, upload glue, SSR-resolved `source`, event-driven refresh |
| `src/api/uploads/index.ts` | `GET /api/uploads` (JSON listing) and the validating multipart `POST /api/uploads` |
| `src/api/uploads/[id].ts` | `GET /api/uploads/:id` — the stored bytes served with their MIME type |
| `src/server/store.ts` | Storage: in-memory map, mirrored to `.data/uploads/` in dev, memory-only under test |
| `src/server/uploads.api.ts` | `api.uploads.list` — the gallery listing as a typed agent tool |
| `src/routes/index.tsx` | The page mounting the island |
