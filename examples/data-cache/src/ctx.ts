/**
 * The session, such as it is: a cookie, read per request. It exists to make the
 * fail-safe visible — `/account` renders this and must never be shareable, and
 * nothing about the route has to remember that.
 */
export default function ctx(req: Request) {
  const session = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];

  return { user: session ? decodeURIComponent(session) : undefined };
}
