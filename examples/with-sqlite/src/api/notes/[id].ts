import type { HandlerContext } from '@janux/server';
import { deleteNote, getNote, updateNote } from '../../server/db';

const NOT_FOUND = () => Response.json({ error: 'note not found' }, { status: 404 });

// GET /api/notes/:id — one note.
export function GET({ params }: HandlerContext) {
  const note = getNote(Number(params.id));

  return note ? Response.json(note) : NOT_FOUND();
}

// PUT /api/notes/:id — partial update from a JSON body `{ title?, body? }`.
export async function PUT({ req, params }: HandlerContext) {
  const id = Number(params.id);
  const input = (await req.json()) as { title?: string; body?: string };
  const updated = getNote(id) ? updateNote(id, input) : null;

  return updated ? Response.json(updated) : NOT_FOUND();
}

// DELETE /api/notes/:id — a classic REST delete executes immediately: the HTTP
// call itself is the human's action. Contrast with the agent surface, where
// `api.notes.remove` (guard `confirm`) becomes a proposal a human approves.
export function DELETE({ params }: HandlerContext) {
  return deleteNote(Number(params.id)) ? new Response(null, { status: 204 }) : NOT_FOUND();
}
