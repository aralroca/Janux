import { formDataWithin, matchesType, type HandlerContext } from '@janux/server';
import { ACCEPT, MAX_BODY_BYTES, MAX_SIZE_BYTES } from '../../limits';
import { listUploads, saveUpload } from '../../server/store';

const reject = (error: string, status: number) => Response.json({ error }, { status });

// GET /api/uploads — the stored gallery, newest first.
export function GET() {
  return Response.json({ uploads: listUploads() });
}

// POST /api/uploads — multipart body with a `file` field. The dropzone already
// filtered client-side; this re-enforces the same contract for raw HTTP callers.
export async function POST({ req }: HandlerContext) {
  // Early 413: an oversized body is refused from content-length (or cut
  // mid-stream) BEFORE being buffered — a 100 MB POST never fills memory.
  const form = await formDataWithin(req, MAX_BODY_BYTES).catch(() => null);

  if (form instanceof Response) return form;
  const file = form?.get('file');

  if (!(file instanceof File)) return reject('multipart field "file" is required', 400);
  if (file.size > MAX_SIZE_BYTES) return reject(`"${file.name}" exceeds the ${MAX_SIZE_BYTES}-byte limit`, 413);
  // Magic bytes, not the declared type: a `.txt` renamed to `.png` fails here.
  if (!(await matchesType(file, ACCEPT))) return reject(`only images are accepted, got "${file.type || 'unknown'}"`, 415);

  return Response.json(saveUpload(file.name, file.type, new Uint8Array(await file.arrayBuffer())), { status: 201 });
}
