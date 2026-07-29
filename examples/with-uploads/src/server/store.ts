import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StoredUpload {
  id: string;
  name: string;
  type: string;
  size: number;
}

interface Entry {
  meta: StoredUpload;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Bytes stay in memory under test; in dev they also persist to `.data/uploads/`. */
// `fileURLToPath` rather than Bun's `import.meta.dir`: Vite's dev module runner lacks the latter.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DISK_DIR = process.env.NODE_ENV === 'test' ? null : join(MODULE_DIR, '../../.data/uploads');

const TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const entries = new Map<string, Entry>();

/** Disk layout is `<id>__<name>`; the MIME type comes back from the extension. */
function entryFromDisk(fileName: string): Entry | null {
  const [id, name] = fileName.split('__');

  if (!id || !name) return null;
  const bytes = new Uint8Array(readFileSync(join(DISK_DIR!, fileName)));
  const type = TYPE_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream';

  return { meta: { id, name, type, size: bytes.byteLength }, bytes };
}

/** Dev boot: reload whatever a previous run left in `.data/uploads/`. */
function restore(): void {
  if (!DISK_DIR) return;
  mkdirSync(DISK_DIR, { recursive: true });
  readdirSync(DISK_DIR)
    .sort()
    .map(entryFromDisk)
    .filter((entry): entry is Entry => entry !== null)
    .forEach((entry) => entries.set(entry.meta.id, entry));
}

restore();

/** Newest first — the order the gallery renders. */
export function listUploads(): StoredUpload[] {
  return [...entries.values()].map((entry) => entry.meta).reverse();
}

export function readUpload(id: string): Entry | undefined {
  return entries.get(id);
}

export function saveUpload(name: string, type: string, bytes: Uint8Array<ArrayBuffer>): StoredUpload {
  const id = `up_${crypto.randomUUID().slice(0, 8)}`;
  const safeName = name.replace(/[^\w.-]+/g, '_') || 'file';
  const meta: StoredUpload = { id, name: safeName, type, size: bytes.byteLength };

  entries.set(id, { meta, bytes });
  if (DISK_DIR) writeFileSync(join(DISK_DIR, `${id}__${safeName}`), bytes);

  return meta;
}
