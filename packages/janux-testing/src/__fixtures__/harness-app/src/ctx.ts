/** Request ctx the fixture derives: the user the `x-user` header names. */
export default function ctxFor(req: Request): { user?: string } {
  return { user: req.headers.get('x-user') ?? undefined };
}
