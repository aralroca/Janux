import { component, enums, int, intent, onEvent, schema, source, str } from 'janux';
import { dropzone, type Dropzone, type UploadOutcome } from 'janux/client';
import { ACCEPT, MAX_SIZE_BYTES } from '../limits';
import { list } from '../server/uploads.api';

/** One zone per island instance, keyed by its (stable) state object. */
const zones = new WeakMap<object, Dropzone>();

let unwire: (() => void) | undefined;

const meta = (outcome: UploadOutcome) => outcome.body as { id?: string; name?: string; error?: string };

/**
 * Uploads the dropped files through `zone.upload()` — one multipart POST per
 * file, progress reported per file via `onProgress`. Files are not JSON, so
 * the bytes ride plain HTTP; state only ever changes through the declared intents.
 */
async function send(bag: any, files: File[]): Promise<void> {
  await bag.intents.begin();
  const outcomes = await zones.get(bag.state)!.upload('/api/uploads', files);
  const accepted = outcomes.filter((outcome) => outcome.ok);
  const failed = outcomes.find((outcome) => !outcome.ok);
  const last = accepted[accepted.length - 1];

  await bag.intents.settle({
    lastId: last ? (meta(last).id ?? '') : '',
    lastName: last ? (meta(last).name ?? '') : '',
    error: failed ? (meta(failed).error ?? 'upload failed') : '',
  });
}

/** dropzone() wires drag & drop, paste and the per-file progress feed. */
function wireZone(bag: any): (() => void) | undefined {
  const host = document.querySelector<HTMLElement>('.dropzone');

  if (!host) return undefined;
  const zone = dropzone({
    accept: ACCEPT,
    multiple: true,
    maxSize: MAX_SIZE_BYTES,
    onFiles: (files) => send(bag, files),
    onProgress: ({ file, sent, total }) => bag.intents.progress({ name: file.name, percent: Math.round((sent / total) * 100) }),
  });
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
    percent: int().default(0),
    sending: str().default(''),
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
        state.percent = 0;
        state.sending = '';
      },
    }),
    progress: intent({
      description: 'Internal: per-file upload progress from the dropzone transport.',
      guard: 'forbidden',
      input: schema({ name: str().default(''), percent: int().default(0) }),
      run: ({ state, input }: any) => {
        state.sending = input.name;
        state.percent = input.percent;
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

        {state.status === 'uploading' ? (
          <div class="busy">
            <p>
              Uploading {state.sending}… {state.percent}%
            </p>
            <progress class="bar" value={state.percent} max={100} />
          </div>
        ) : null}
        {state.error ? <p class="error">{state.error}</p> : null}

        {state.lastId ? (
          <figure class="preview">
            <img src={`/api/uploads/${state.lastId}`} alt={state.lastName} />
            <figcaption>Uploaded: {state.lastName}</figcaption>
            <p class="progress">
              {state.lastName} — {state.percent}%
            </p>
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
