import { component, enums, intent, onEvent, schema, source, str } from 'janux';
import { dropzone, type Dropzone } from 'janux/client';
import { ACCEPT, MAX_SIZE_BYTES } from '../limits';
import { list } from '../server/uploads.api';

/** One zone per island instance, keyed by its (stable) state object. */
const zones = new WeakMap<object, Dropzone>();

let unwire: (() => void) | undefined;

interface UploadResult {
  ok: boolean;
  meta?: { id: string; name: string };
  error?: string;
}

/** One file → one multipart POST to the `src/api` handler. */
async function postFile(file: File): Promise<UploadResult> {
  const body = new FormData();

  body.set('file', file);
  const response = await fetch('/api/uploads', { method: 'POST', body });
  const payload: any = await response.json();

  return response.ok ? { ok: true, meta: payload } : { ok: false, error: payload.error };
}

/**
 * Uploads the dropped files. Files are not JSON, so the bytes ride plain
 * multipart HTTP; state only ever changes through the declared intents.
 */
async function send(bag: any, files: File[]): Promise<void> {
  await bag.intents.begin();
  const results = await Promise.all(files.map(postFile));
  const accepted = results.filter((result) => result.ok);
  const failed = results.find((result) => !result.ok);
  const last = accepted[accepted.length - 1];

  await bag.intents.settle({
    lastId: last?.meta?.id ?? '',
    lastName: last?.meta?.name ?? '',
    error: failed?.error ?? '',
  });
}

/** dropzone() wires drag & drop and paste onto the visible target. */
function wireZone(bag: any): (() => void) | undefined {
  const host = document.querySelector<HTMLElement>('.dropzone');

  if (!host) return undefined;
  const zone = dropzone({ accept: ACCEPT, multiple: true, maxSize: MAX_SIZE_BYTES, onFiles: (files) => send(bag, files) });
  const detach = zone.attach(host);
  const sync = () => host.classList.toggle('over', zone.isOver.value);
  const events = ['dragover', 'dragleave', 'drop'];

  zones.set(bag.state, zone);
  events.forEach((name) => host.addEventListener(name, sync));

  return () => {
    events.forEach((name) => host.removeEventListener(name, sync));
    detach();
  };
}

export const Gallery = component({
  name: 'gallery',
  description:
    'An image gallery fed by drag-and-drop uploads. Agents read the same listing via api.uploads.list ' +
    'and can re-pull it with gallery.refresh; the file picker itself needs a human gesture.',

  state: schema({
    status: enums(['idle', 'uploading', 'error']).default('idle'),
    error: str().default(''),
    lastId: str().default(''),
    lastName: str().default(''),
  }),

  sources: {
    gallery: source({
      description: 'Every stored upload, newest first',
      query: () => list({}),
      refresh: onEvent('uploads.changed'),
    }),
  },

  emits: { 'uploads.changed': schema({}) },

  intents: {
    pick: intent({
      description: 'Open the native file picker. Needs a human gesture, so agents cannot call it.',
      guard: 'forbidden',
      run: ({ state }: any) => zones.get(state)?.open(),
    }),
    refresh: intent({
      description: 'Re-read the gallery listing from the server.',
      run: ({ emit }: any) => emit('uploads.changed', {}),
    }),
    begin: intent({
      description: 'Internal: mark the uploader busy while files are in flight.',
      guard: 'forbidden',
      run: ({ state }: any) => {
        state.status = 'uploading';
        state.error = '';
      },
    }),
    settle: intent({
      description: 'Internal: record the outcome of an upload batch and refresh the gallery.',
      guard: 'forbidden',
      input: schema({ lastId: str().default(''), lastName: str().default(''), error: str().default('') }),
      run: ({ state, input, emit }: any) => {
        state.status = input.error ? 'error' : 'idle';
        state.error = input.error;
        if (!input.lastId) return;
        state.lastId = input.lastId;
        state.lastName = input.lastName;
        emit('uploads.changed', {});
      },
    }),
  },

  lifecycle: {
    attach: (bag: any) => {
      unwire = wireZone(bag);
    },
    detach: () => unwire?.(),
  },

  view: ({ state, sources, intents }: any) => {
    const uploads = (sources.gallery.value?.uploads ?? []) as any[];

    return (
      <section class="uploader">
        <div class="dropzone">
          <p>Drag &amp; drop images here — or paste, or</p>
          <button type="button" class="pick" onClick={intents.pick}>
            Choose files
          </button>
          <p class="limits">Images only, up to 1 MB each</p>
        </div>

        {state.status === 'uploading' ? <p class="busy">Uploading…</p> : null}
        {state.error ? <p class="error">{state.error}</p> : null}

        {state.lastId ? (
          <figure class="preview">
            <img src={`/api/uploads/${state.lastId}`} alt={state.lastName} />
            <figcaption>Uploaded: {state.lastName}</figcaption>
          </figure>
        ) : null}

        {uploads.length === 0 ? (
          <p class="empty">No uploads yet — drop an image above.</p>
        ) : (
          <ul class="gallery">
            {uploads.map((upload: any) => (
              <li key={upload.id} class="shot">
                <img src={`/api/uploads/${upload.id}`} alt={upload.name} />
                <span>
                  {upload.name} · {upload.size} bytes
                </span>
              </li>
            ))}
          </ul>
        )}
        <p class="count">uploads:{uploads.length}</p>
      </section>
    );
  },
});
