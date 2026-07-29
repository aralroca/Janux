import { signal, type Sig } from '../signals';

export interface UploadProgress {
  file: File;
  /** Bytes sent so far / total to send. A final `sent === total` tick is guaranteed. */
  sent: number;
  total: number;
}

export interface UploadOutcome {
  file: File;
  /** HTTP status; `0` when the request never completed (network error). */
  status: number;
  ok: boolean;
  /** Parsed JSON response when possible, the raw text otherwise. */
  body: unknown;
}

export interface DropzoneOptions {
  accept?: string[];
  multiple?: boolean;
  maxSize?: number;
  onFiles: (files: File[]) => void;
  /** Per-file progress for `zone.upload()` uploads. */
  onProgress?: (progress: UploadProgress) => void;
}

export interface Dropzone {
  isOver: Sig<boolean>;
  /** Attach to an element: wires drag/drop, paste and click-to-pick. */
  attach(el: HTMLElement): () => void;
  /** Open the native file picker. */
  open(): void;
  /** POST each file as `multipart/form-data` to `url`, reporting per-file progress via `onProgress`. */
  upload(url: string, files: File[], field?: string): Promise<UploadOutcome[]>;
}

const parsedBody = (xhr: XMLHttpRequest): unknown => {
  try {
    return JSON.parse(xhr.responseText);
  } catch {
    return xhr.responseText;
  }
};

const outcomeOf = (file: File, xhr: XMLHttpRequest): UploadOutcome => ({
  file,
  status: xhr.status,
  ok: xhr.status >= 200 && xhr.status < 300,
  body: parsedBody(xhr),
});

type Progress = DropzoneOptions['onProgress'];
type Settle = (outcome: UploadOutcome) => void;

function wire(xhr: XMLHttpRequest, file: File, onProgress: Progress, resolve: Settle): void {
  xhr.upload.addEventListener('progress', (event) =>
    onProgress?.({ file, sent: event.loaded, total: event.total || file.size }),
  );
  xhr.addEventListener('load', () => {
    onProgress?.({ file, sent: file.size, total: file.size });
    resolve(outcomeOf(file, xhr));
  });
  xhr.addEventListener('error', () => resolve({ file, status: 0, ok: false, body: undefined }));
}

/** One file → one multipart POST. XMLHttpRequest, because `xhr.upload` is the transport browsers report upload progress on. */
function postFile(url: string, file: File, field: string, onProgress: Progress): Promise<UploadOutcome> {
  const xhr = new XMLHttpRequest();
  const body = new FormData();

  body.set(field, file);
  xhr.open('POST', url);

  return new Promise((resolve) => {
    wire(xhr, file, onProgress, resolve);
    xhr.send(body);
  });
}

function accepted(file: File, options: DropzoneOptions): boolean {
  if (options.maxSize && file.size > options.maxSize) return false;
  if (!options.accept?.length) return true;

  // `*/*` is an ordinary accept value (and rides straight into input.accept):
  // treating it as a literal type rejected every file instead of allowing all.
  return options.accept.some((type) => {
    if (type === '*/*') return true;

    return type.endsWith('/*') ? file.type.startsWith(type.slice(0, -1)) : file.type === type;
  });
}

/** Client dropzone helper (RFC 0002 §10.2): drag, paste and file-picker → File[]. */
export function dropzone(options: DropzoneOptions): Dropzone {
  const isOver = signal(false);
  const input = document.createElement('input');

  input.type = 'file';
  input.hidden = true;
  if (options.accept) input.accept = options.accept.join(',');
  input.multiple = options.multiple ?? false;
  const emit = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((file) => accepted(file, options));

    if (files.length) options.onFiles(files);
  };

  input.addEventListener('change', () => emit(input.files));

  return {
    isOver,
    open: () => input.click(),
    upload: (url, files, field = 'file') => Promise.all(files.map((file) => postFile(url, file, field, options.onProgress))),
    attach(el: HTMLElement) {
      const onOver = (event: DragEvent) => {
        event.preventDefault();
        isOver.value = true;
      };
      const onLeave = () => (isOver.value = false);
      const onDrop = (event: DragEvent) => {
        event.preventDefault();
        isOver.value = false;
        emit(event.dataTransfer?.files ?? null);
      };
      const onPaste = (event: ClipboardEvent) => emit(event.clipboardData?.files ?? null);

      el.append(input);
      el.addEventListener('dragover', onOver);
      el.addEventListener('dragleave', onLeave);
      el.addEventListener('drop', onDrop);
      el.addEventListener('paste', onPaste);

      return () => {
        el.removeEventListener('dragover', onOver);
        el.removeEventListener('dragleave', onLeave);
        el.removeEventListener('drop', onDrop);
        el.removeEventListener('paste', onPaste);
        input.remove();
      };
    },
  };
}
