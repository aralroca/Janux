import { afterEach, describe, expect, it } from 'bun:test';
import type { SchedulesMount } from './index';
import { createJanuxServer } from './index';

function mount(): SchedulesMount & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async tick() {
      calls.push('tick');

      return ['sweep'];
    },
    start() {
      calls.push('start');
    },
    stop() {
      calls.push('stop');
    },
  };
}

const tickRequest = (headers: Record<string, string> = {}, method = 'POST') =>
  new Request('http://localhost/_janux/schedules/tick', { method, headers });

afterEach(() => {
  delete process.env.JANUX_CRON_SECRET;
  delete process.env.CRON_SECRET;
});

describe('schedules on the server', () => {
  it('starts the in-process loop for the process trigger and never exposes the tick endpoint', async () => {
    const schedules = mount();
    const server = createJanuxServer({ schedules: { mount: schedules, trigger: 'process' } });

    expect(schedules.calls).toEqual(['start']);
    const response = await server.fetch(tickRequest());

    expect(response.status).toBe(404);
    expect(schedules.calls).toEqual(['start']);
  });

  /** Dev rebuilds the server on every save; without this each save leaks a live tick loop. */
  it('stop() stops the loop it started', () => {
    const schedules = mount();
    const server = createJanuxServer({ schedules: { mount: schedules, trigger: 'process' } });

    server.stop();
    expect(schedules.calls).toEqual(['start', 'stop']);
    // Idempotent: a caller that stops twice is not an error.
    server.stop();
    expect(schedules.calls).toEqual(['start', 'stop', 'stop']);
  });

  it('stop() is safe on a server with no schedules at all', () => {
    expect(() => createJanuxServer().stop()).not.toThrow();
  });

  it('refuses the http trigger until the cron secret is configured', async () => {
    const schedules = mount();
    const server = createJanuxServer({ schedules: { mount: schedules, trigger: 'http' } });

    expect(schedules.calls).toEqual([]);
    const response = await server.fetch(tickRequest());

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('schedule_trigger_unconfigured');
  });

  it('requires the bearer secret and then ticks', async () => {
    process.env.JANUX_CRON_SECRET = 's3cret';
    const schedules = mount();
    const server = createJanuxServer({ schedules: { mount: schedules, trigger: 'http' } });

    expect((await server.fetch(tickRequest())).status).toBe(401);
    expect((await server.fetch(tickRequest({ authorization: 'Bearer nope' }))).status).toBe(401);
    const response = await server.fetch(tickRequest({ authorization: 'Bearer s3cret' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ran: ['sweep'] });
    expect(schedules.calls).toEqual(['tick']);
  });

  /**
   * Vercel Cron — the only shipped `http` target — triggers with a GET. A
   * POST-only endpoint would answer every scheduled invocation with a 405 and
   * no occurrence would ever run.
   */
  it('accepts the GET a platform cron sends, and refuses the methods neither uses', async () => {
    process.env.JANUX_CRON_SECRET = 's3cret';
    const schedules = mount();
    const server = createJanuxServer({ schedules: { mount: schedules, trigger: 'http' } });
    const get = await server.fetch(tickRequest({ authorization: 'Bearer s3cret' }, 'GET'));

    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ ran: ['sweep'] });
    expect((await server.fetch(tickRequest({ authorization: 'Bearer s3cret' }, 'DELETE'))).status).toBe(405);
  });

  /** Vercel sends the bearer it knows as `CRON_SECRET`; requiring a second name would be ours, not theirs. */
  it("falls back to the platform's own CRON_SECRET", async () => {
    process.env.CRON_SECRET = 'from-platform';
    const server = createJanuxServer({ schedules: { mount: mount(), trigger: 'http' } });

    expect((await server.fetch(tickRequest({ authorization: 'Bearer from-platform' }))).status).toBe(200);
    expect((await server.fetch(tickRequest({ authorization: 'Bearer nope' }))).status).toBe(401);
  });

  it('prefers JANUX_CRON_SECRET when both are set', async () => {
    process.env.JANUX_CRON_SECRET = 'ours';
    process.env.CRON_SECRET = 'theirs';
    const server = createJanuxServer({ schedules: { mount: mount(), trigger: 'http' } });

    expect((await server.fetch(tickRequest({ authorization: 'Bearer ours' }))).status).toBe(200);
    expect((await server.fetch(tickRequest({ authorization: 'Bearer theirs' }))).status).toBe(401);
  });
});
