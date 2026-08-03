/** Blocks /admin for anonymous requests — the harness asserts both outcomes. */
export default function middleware(req: Request): Response | undefined {
  const anonymous = !req.headers.get('x-user');

  if (new URL(req.url).pathname.startsWith('/admin') && anonymous) {
    return new Response('middleware: no user', { status: 403 });
  }

  return undefined;
}
