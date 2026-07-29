import { api } from '@janux/server';
import { schema, str, int, list as listOf } from 'janux';
import { createNote, deleteNote, listNotes, updateNote } from './db';

const note = { id: int(), title: str(), body: str(), createdAt: str() };

export const list = api({
  description:
    'List every stored note (id, title, body, createdAt), newest first. ' +
    'Call this before answering any question about existing notes — never answer from memory.',
  output: schema({ notes: listOf(note) }),
  run: () => ({ notes: listNotes() }),
});

export const create = api({
  description: 'Create a note and persist it in SQLite. Returns the stored row, id included.',
  input: schema({ title: str().min(1).max(120), body: str().max(2000).default('') }),
  output: schema(note),
  run: ({ input }) => createNote(input.title, input.body),
});

export const update = api({
  description: 'Replace the title and body of an existing note. Fails if the id does not exist.',
  input: schema({ id: int(), title: str().min(1).max(120), body: str().max(2000) }),
  output: schema(note),
  run: ({ input }) => {
    const updated = updateNote(input.id, { title: input.title, body: input.body });

    if (!updated) throw new Error(`No note with id ${input.id}`);

    return updated;
  },
});

export const remove = api({
  description: 'Delete a note permanently. Destructive and irreversible — the row is gone from the database.',
  input: schema({ id: int() }),
  output: schema({ deleted: int() }),
  guard: 'confirm',
  run: ({ input }) => {
    if (!deleteNote(input.id)) throw new Error(`No note with id ${input.id}`);

    return { deleted: input.id };
  },
});
