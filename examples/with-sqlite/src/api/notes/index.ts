import type { HandlerContext } from '@janux/server';
import { createNote, listNotes } from '../../server/db';

// GET /api/notes — every stored note, newest first.
export function GET() {
  return Response.json({ notes: listNotes() });
}

// POST /api/notes — create from a JSON body `{ title, body? }`.
export async function POST({ req }: HandlerContext) {
  const input = (await req.json()) as { title?: string; body?: string };
  const title = input.title?.trim();

  if (!title) return Response.json({ error: 'title is required' }, { status: 400 });

  return Response.json(createNote(title, input.body ?? ''), { status: 201 });
}
