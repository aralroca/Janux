import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: string;
}

// Not `import.meta.dir`: that Bun-ism is missing under Vite's dev runner.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.data');

const SEED: Array<Pick<Note, 'title' | 'body'>> = [
  { title: 'Hello, SQLite', body: 'This note lives in a real database — restart the server and it is still here.' },
  { title: 'Two server surfaces', body: 'api() RPC and the REST handlers under /api read and write this same file.' },
];

/** A throwaway `:memory:` database under test; a real file otherwise. */
function openDatabase(): Database {
  if (process.env.NODE_ENV === 'test') return new Database(':memory:');
  mkdirSync(DATA_DIR, { recursive: true });

  return new Database(join(DATA_DIR, 'notes.db'));
}

const db = openDatabase();

db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const COLUMNS = 'id, title, body, created_at AS createdAt';

export function listNotes(): Note[] {
  return db.query(`SELECT ${COLUMNS} FROM notes ORDER BY id DESC`).all() as Note[];
}

export function getNote(id: number): Note | null {
  return (db.query(`SELECT ${COLUMNS} FROM notes WHERE id = ?1`).get(id) as Note | null) ?? null;
}

export function createNote(title: string, body: string): Note {
  const row = db.query('INSERT INTO notes (title, body) VALUES (?1, ?2) RETURNING id').get(title, body) as {
    id: number;
  };

  return getNote(row.id)!;
}

/** Partial update: an absent field keeps its stored value. */
export function updateNote(id: number, fields: { title?: string; body?: string }): Note | null {
  db.run('UPDATE notes SET title = COALESCE(?1, title), body = COALESCE(?2, body) WHERE id = ?3', [
    fields.title ?? null,
    fields.body ?? null,
    id,
  ]);

  return getNote(id);
}

export function deleteNote(id: number): boolean {
  return db.query('DELETE FROM notes WHERE id = ?1 RETURNING id').get(id) !== null;
}

/** First boot (or every test boot): a couple of notes so the page never starts blank. */
if (listNotes().length === 0) SEED.forEach((note) => createNote(note.title, note.body));
