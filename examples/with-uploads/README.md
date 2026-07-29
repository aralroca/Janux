# File uploads

A drag-and-drop image gallery showing the whole upload path end to end: `dropzone()` collects the files in the browser and posts them with `zone.upload()` (per-file progress included), a `src/api/**` handler receives the multipart body under a hard size limit and validates the real bytes, and the gallery is server-rendered from the same store agents read as a tool.

- **`dropzone()` client helper** — drag & drop, paste and click-to-pick in one call: `accept: ['image/*']` and `maxSize` filter files *before* your code ever sees them, `zone.isOver` styles the target reactively, `zone.open()` powers the "Choose files" button. `zone.upload()` posts each file as multipart and feeds `onProgress` — the visible progress bar, ending on a guaranteed 100% tick.
- **Bounded multipart handler** — `POST /api/uploads` reads the body through `formDataWithin(req, MAX_BODY_BYTES)`: an oversized body 413s from `content-length` **before being buffered** (a chunked body without one is cut mid-stream), so a 100 MB POST never fills memory. The shared contract (`src/limits.ts`) is then re-enforced per file — a raw HTTP caller cannot bypass what the dropzone filters client-side.
- **Real MIME validation** — `matchesType(file, ACCEPT)` sniffs the magic bytes (png, jpeg, gif, webp…): a `.txt` renamed to `.png` gets a `415` no matter what `file.type` claims. The declared type is caller-supplied fiction; only the bytes are trusted.
- **Server-rendered gallery** — the island's `source` resolves `uploads.list` during SSR, so the page arrives with the gallery already in the HTML; `refresh: onEvent('uploads.changed')` refetches after every upload, no reload.
- **Storage that fits each mode** — `.data/uploads/` on disk in dev (restart and your images are still there), pure memory under `NODE_ENV=test`; `GET /api/uploads/:id` serves the bytes back with their MIME type for the `<img>` tags.
- **Agentic surface** — `api.uploads.list` (the listing as a typed tool) and `gallery.refresh` are `auto`; `gallery.pick` is `forbidden` because a native file picker needs a human gesture. The upload byte-stream itself rides plain HTTP, the surface the manifest points agents at.

```bash
bun install
bun run dev   # http://localhost:4321
```

Both ends of the contract, side by side — the dropzone filters and reports progress, the handler enforces:

```ts
import { dropzone } from 'janux/client';

const zone = dropzone({
  accept: ['image/*'],          // MIME list, wildcards supported
  multiple: true,
  maxSize: 1024 * 1024,         // oversized files are filtered out client-side
  onFiles: (files) => zone.upload('/api/uploads', files),
  onProgress: ({ file, sent, total }) => report(file.name, Math.round((sent / total) * 100)),
});

const detachZone = zone.attach(dropTarget); // drag & drop, paste, click-to-pick
zone.open();                                // open the native picker yourself
```

```ts
// src/api/uploads/index.ts → POST /api/uploads
import { formDataWithin, matchesType } from '@janux/server';

export async function POST({ req }: { req: Request }) {
  const form = await formDataWithin(req, MAX_BODY_BYTES); // early 413, body never buffered past the limit

  if (form instanceof Response) return form;
  const file = form.get('file');

  if (!(file instanceof File)) return Response.json({ error: 'multipart field "file" is required' }, { status: 400 });
  if (!(await matchesType(file, ['image/*']))) return Response.json({ error: 'only images are accepted' }, { status: 415 });

  return Response.json(save(file), { status: 201 });
}
```

## Where things live

| File | What it shows |
|---|---|
| `src/limits.ts` | The shared upload contract: accepted types, max file size and the transport body ceiling |
| `src/components/Gallery.tsx` | The island: `dropzone()` wired in `lifecycle.attach`, `zone.upload()` + progress intents, SSR-resolved `source`, event-driven refresh |
| `src/api/uploads/index.ts` | `GET /api/uploads` (JSON listing) and the bounded, byte-sniffing multipart `POST /api/uploads` |
| `src/api/uploads/[id].ts` | `GET /api/uploads/:id` — the stored bytes served with their MIME type |
| `src/server/store.ts` | Storage: in-memory map, mirrored to `.data/uploads/` in dev, memory-only under test |
| `src/server/uploads.api.ts` | `api.uploads.list` — the gallery listing as a typed agent tool |
| `src/routes/index.tsx` | The page mounting the island |
