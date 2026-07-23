import type { HandlerContext } from '../../http-handlers';

export function GET() {
  return Response.json({ ok: true });
}

export function POST({ req }: HandlerContext) {
  return req.text().then((body) => new Response(`echo:${body}`, { status: 201 }));
}
