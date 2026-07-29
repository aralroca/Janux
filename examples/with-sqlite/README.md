# SQLite persistence

A notes CRUD persisted with `bun:sqlite` — zero dependencies — where the **two server surfaces** of Janux serve the same database side by side: `api()` functions (RPC endpoint + typed client stub + agent tool) and classic REST route handlers under `src/api/**`.

- **Real persistence, zero dependencies** — `src/server/db.ts` opens `.data/notes.db` with Bun's built-in SQLite driver; restart the server and your notes are still there. Under `NODE_ENV=test` it switches to `:memory:` for deterministic suites.
- **`api()` surface** — `notes.api.ts` exposes `list` / `create` / `update` / `remove` as validated `POST /_janux/api/notes.*` endpoints, ~100-byte client stubs and agent tools, all from one definition.
- **REST surface** — `GET/POST /api/notes` and `GET/PUT/DELETE /api/notes/:id` are plain file-based handlers returning Web `Response`s: the shape webhooks, integrations and third-party clients expect. Same database, no duplication — both surfaces call the same `db.ts` helpers.
- **Guarded deletion** — creating and editing are `auto`; `api.notes.remove` and the island's `notes.remove` are `guard: 'confirm'`, so an agent's delete becomes a *proposal* a human settles via `/_janux/approve`. A REST `DELETE` executes immediately: the HTTP call itself is the human action.
- **SSR from the database** — the island's `source` resolves `notes.list` during server render: the page arrives with the rows already in the HTML, and `refresh: onEvent('notes.changed')` refetches after every mutation.

```bash
bun install
bun run dev   # http://localhost:4321
```

The whole point in one pair — a typed tool and a REST handler backed by the same table:

```ts
import { api } from '@janux/server';
import { schema, int } from 'janux';
import { deleteNote } from './db';

export const remove = api({
  description: 'Delete a note permanently.',
  input: schema({ id: int() }),
  guard: 'confirm', // agent calls become proposals; a human approves
  run: ({ input }) => ({ deleted: deleteNote(input.id) }),
});

// src/api/notes/[id].ts — DELETE /api/notes/:id, immediate, no guard
export function DELETE({ params }: { params: { id: string } }) {
  return deleteNote(Number(params.id)) ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}
```

## Where things live

| File | What it shows |
|---|---|
| `src/server/db.ts` | `bun:sqlite` setup: file-backed in dev (`.data/notes.db`), `:memory:` under test, typed row helpers |
| `src/server/notes.api.ts` | The `api()` surface: `list`/`create`/`update` (`auto`) and `remove` (`confirm`) |
| `src/api/notes/index.ts` | REST handlers `GET /api/notes` (list) and `POST /api/notes` (create) |
| `src/api/notes/[id].ts` | REST handlers `GET`/`PUT`/`DELETE /api/notes/:id` on the same database |
| `src/components/Notes.tsx` | The island: SSR-resolved `source`, add form, confirm-guarded delete, event-driven refresh |
| `src/routes/index.tsx` | The page mounting the island |
