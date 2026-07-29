import type { HandlerContext } from '@janux/server';
import { MAX_SIZE_BYTES } from '../../limits';
import { listUploads, saveUpload } from '../../server/store';

const reject = (error: string, status: number) => Response.json({ error }, { status });

// GET /api/uploads — the stored gallery, newest first.
export function GET() {
  return Response.json({ uploads: listUploads() });
}

// POST /api/uploads — multipart body with a `file` field. The dropzone already
// filtered client-side; this re-enforces the same contract for raw HTTP callers.
export async function POST({ req }: HandlerContext) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File)) return reject('multipart field "file" is required', 400);
  if (!file.type.startsWith('image/')) return reject(`only images are accepted, got "${file.type || 'unknown'}"`, 415);
  if (file.size > MAX_SIZE_BYTES) return reject(`"${file.name}" exceeds the ${MAX_SIZE_BYTES}-byte limit`, 413);

  return Response.json(saveUpload(file.name, file.type, new Uint8Array(await file.arrayBuffer())), { status: 201 });
}
