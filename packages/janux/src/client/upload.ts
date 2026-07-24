import { signal, type Sig } from '../signals';

export interface DropzoneOptions {
  accept?: string[];
  multiple?: boolean;
  maxSize?: number;
  onFiles: (files: File[]) => void;
}

export interface Dropzone {
  isOver: Sig<boolean>;
  /** Attach to an element: wires drag/drop, paste and click-to-pick. */
  attach(el: HTMLElement): () => void;
  /** Open the native file picker. */
  open(): void;
}

function accepted(file: File, options: DropzoneOptions): boolean {
  if (options.maxSize && file.size > options.maxSize) return false;
  if (!options.accept?.length) return true;

  return options.accept.some((type) =>
    type.endsWith('/*') ? file.type.startsWith(type.slice(0, -1)) : file.type === type,
  );
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
