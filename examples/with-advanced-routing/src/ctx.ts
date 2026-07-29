/**
 * `src/ctx.ts` is the app-wide request context: whatever it returns is handed to
 * every page and layout as `ctx`. The shell needs the current URL to mark its
 * active section — and the request is the only thing that knows it.
 */
export default function ctx(req: Request) {
  return { pathname: new URL(req.url).pathname };
}
