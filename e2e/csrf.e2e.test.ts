import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage, serveBuilt } from './support/app';

/**
 * The one half of the CSRF defence that no unit test can assert: that a real
 * browser, on a real third-party page, is actually refused.
 *
 * The corpus (conformance/security/csrf) pins the decision given a set of
 * headers. This pins the headers themselves — that Chrome sends what we think it
 * sends, and that the attack shape reaches the server at all rather than dying
 * in a CORS preflight we then mistake for a defence. It uses a **simple
 * request** (`content-type: text/plain`, `mode: no-cors`) for exactly that
 * reason: no preflight, so the POST really arrives, cookie jar and all. `api()`
 * reads the body with `req.json()` regardless of the declared type, so the
 * payload lands as JSON — which is what makes the shape work at all.
 *
 * Verified against `examples/human-in-the-loop`, whose `payments.transfer` is
 * `guard: 'confirm'`: a *human*-origin call executes on the spot (the click is
 * the confirmation), so a forged one moves money with no proposal to approve.
 * Without the guard this test wires 999999 cents to "Attacker LLC".
 */

const APP = 'examples/human-in-the-loop';
const BUILT = isBuilt(APP);

let browser: Browser | undefined;
let victim = '';
let stopVictim: (() => void) | undefined;
let attacker: ReturnType<typeof Bun.serve> | undefined;

/** Seen by the victim, so the assertions can tell "refused" from "never sent". */
const seen: { site: string | null; origin: string | null; status: number }[] = [];

const forgeryPage = (target: string) => `<!doctype html><title>free kittens</title><h1>free kittens</h1><script>
  fetch(${JSON.stringify(target)} + "/_janux/api/payments.transfer", {
    method: "POST",
    mode: "no-cors",
    credentials: "include",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ to: "Attacker LLC", amountCents: 999999 }),
  }).then(() => { document.title = "sent"; }, (error) => { document.title = "browser-blocked: " + error; });
</script>`;

/** Every transfer that really executed — a forged call must leave this untouched. */
const executedTransfers = async (): Promise<{ to: string }[]> => {
  const res = await fetch(`${victim}/_janux/api/payments.ledger`, {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
  });

  return ((await res.json()) as any).result.transfers;
};

beforeAll(async () => {
  if (!BUILT) return;
  const app = await serveBuilt(APP);

  ({ stop: stopVictim } = app);
  // Proxied so the guard's inputs and its verdict are both observable.
  const proxy = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const res = await fetch(new Request(`${app.base}${new URL(req.url).pathname}`, req));

      seen.push({ site: req.headers.get('sec-fetch-site'), origin: req.headers.get('origin'), status: res.status });

      return res;
    },
  });

  victim = `http://localhost:${proxy.port}`;
  attacker = Bun.serve({ port: 0, fetch: () => new Response(forgeryPage(victim), { headers: { 'content-type': 'text/html' } }) });
  browser = await launchChrome();
});

afterAll(() => {
  attacker?.stop(true);
  stopVictim?.();
});

describe.skipIf(!BUILT)('a third-party page cannot invoke api() in a real browser', () => {
  it(
    'refuses the forged transfer with 403 and executes nothing',
    async () => {
      const { page, errors } = await openPage(browser!);

      seen.length = 0;
      await page.goto(`http://localhost:${attacker!.port}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.title !== 'free kittens', undefined, { timeout: TIMEOUT });

      // The browser let it go out — this is a server-side refusal, not CORS.
      expect(await page.title()).toBe('sent');
      expect(seen).toHaveLength(1);
      expect(seen[0]?.status).toBe(403);
      expect(seen[0]?.origin).toBe(`http://localhost:${attacker!.port}`);
      /*
       * Chrome calls this `same-site`, not `cross-site`: both pages are on
       * `localhost` and only the port differs, which is a different *origin* on
       * the same *site*. Which is the whole reason `same-site` does not pass on
       * its own — treating it as friendly would let this exact request through,
       * and it is also what a subdomain takeover looks like in production.
       */
      expect(seen[0]?.site).toBe('same-site');
      expect(await executedTransfers()).toEqual([]);
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );

  it(
    "the app's own page still reaches the same endpoint",
    async () => {
      const { page, errors } = await openPage(browser!);

      await page.goto(victim, { waitUntil: 'domcontentloaded' });
      seen.length = 0;
      const status = await page.evaluate(async () => {
        const res = await fetch('/_janux/api/payments.ledger', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });

        return res.status;
      });

      expect(status).toBe(200);
      expect(seen.at(-1)).toMatchObject({ site: 'same-origin', status: 200 });
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});
