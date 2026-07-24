import type { HandlerContext } from '../../http-handlers';

export async function POST({ req }: HandlerContext) {
  const form = await req.formData();
  const file = form.get('file') as File | null;

  if (!file) return new Response('no file', { status: 400 });

  return Response.json({ name: file.name, size: (await file.text()).length });
}
