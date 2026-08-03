/**
 * Schedules, as the server sees them (RFC 0002 §20). The mount is built by
 * `@janux/vite/config` from `src/schedules/`; the server only decides how it
 * fires, and that decision is the deployment's own declaration:
 *
 * - `process`: something persistent holds the tick loop — `janux start`,
 *   `@janux/node`, `janux dev`.
 * - `http`: no persistent process exists (serverless), so the platform's cron
 *   POSTs `/_janux/schedules/tick` with the `JANUX_CRON_SECRET` bearer.
 */

export interface SchedulesMount {
  /** Claims and runs everything due right now; resolves with the names that ran. */
  tick(): Promise<string[]>;
  /** The in-process trigger loop, for targets with a persistent process. */
  start(): void;
  stop(): void;
}

export interface SchedulesConfig {
  mount: SchedulesMount;
  trigger: 'process' | 'http';
}

export async function handleScheduleTick(req: Request, mount: SchedulesMount): Promise<Response> {
  // Vercel Cron — and most platform schedulers — trigger with a GET, so
  // accepting only POST would answer every scheduled invocation with a 405.
  // `CRON_SECRET` is the name Vercel sends its bearer under; honouring it means
  // a Vercel deployment needs no second copy of the same secret.
  const secret = process.env.JANUX_CRON_SECRET ?? process.env.CRON_SECRET;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  // Declaring the http trigger is a promise that the platform's cron holds the
  // secret — an unset secret must fail loudly, never tick for anyone who asks.
  if (!secret) return Response.json({ error: 'schedule_trigger_unconfigured' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  return Response.json({ ran: await mount.tick() });
}
