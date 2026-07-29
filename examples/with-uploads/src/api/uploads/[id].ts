import type { HandlerContext } from '@janux/server';
import { readUpload } from '../../server/store';

// GET /api/uploads/:id — the stored bytes, served with their MIME type. This
// is what the gallery's <img> tags point at.
export function GET({ params }: HandlerContext) {
  const stored = readUpload(params.id!);

  if (!stored) return Response.json({ error: 'upload not found' }, { status: 404 });

  return new Response(stored.bytes, {
    headers: { 'content-type': stored.meta.type, 'cache-control': 'no-store' },
  });
}
