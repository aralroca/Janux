import { component, intent, source, onEvent, schema, str, int } from 'janux';
import { create, list, remove as removeApi } from '../server/notes.api';

export const Notes = component({
  name: 'notes',
  description: 'A notebook backed by SQLite: the list every surface reads, plus add and delete controls.',

  sources: {
    notes: source({
      description: 'Every stored note, newest first',
      query: () => list({}),
      refresh: onEvent('notes.changed'),
    }),
  },

  emits: { 'notes.changed': schema({}) },

  intents: {
    add: intent({
      description: 'Create a note from the form fields and persist it in SQLite.',
      input: schema({ title: str().min(1), body: str().default('') }),
      run: async ({ input, emit }: any) => {
        await create({ title: input.title, body: input.body });
        emit('notes.changed', {});
      },
    }),

    remove: intent({
      description: 'Delete a note permanently. Destructive: the row is gone from the database.',
      input: schema({ id: int() }),
      guard: 'confirm',
      run: async ({ input, emit }: any) => {
        await removeApi({ id: input.id });
        emit('notes.changed', {});
      },
    }),
  },

  view: ({ sources, intents }: any) => (
    <section class="notes">
      <form class="composer" onSubmit={intents.add}>
        <input name="title" placeholder="Note title" required />
        <textarea name="body" placeholder="Write something worth persisting…" rows={3} />
        <button type="submit">Add note</button>
      </form>

      {sources.notes.pending ? (
        <p class="empty">Loading notes…</p>
      ) : (
        <ul class="list">
          {sources.notes.value.notes.map((note: any) => (
            <li key={note.id} class="note">
              <header>
                <h2>{note.title}</h2>
                <button class="x" title="Delete note" onClick={intents.remove.with({ id: note.id })}>
                  ✕
                </button>
              </header>
              {note.body ? <p>{note.body}</p> : null}
              <time>{note.createdAt}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  ),
});
