import { describe, expect, it } from 'bun:test';
import { jsx, type Ctx } from 'janux';
import { api } from './api';
import { createJanuxServer } from './server';
import { createSessionStore } from './session';

/**
 * The session as the server wires it: read once per request, handed to
 * `ctxFor` alongside the agent identity, and renewed on the way out. Rotation
 * is only a real battery if the browser hears about it, and `ctxFor` returns a
 * `Ctx` — it has no response to write to.
 */

const SECRET = 'server-side-only';

interface User {
  userId: string;
  scopes?: string[];
}

const asCookie = (setCookie: string) => setCookie.split(';')[0]!;

function serverWith(sessions: ReturnType<typeof createSessionStore<User>>, seen: unknown[]) {
  return createJanuxServer({
    session: sessions,
    routes: { '/': () => jsx('main', {}) },
    apis: { echo: { ping: api({ description: 'Ping', run: () => 'pong' }) } },
    ctxFor: (_req, bag) => {
      seen.push(bag);

      return { userId: (bag?.session as User | undefined)?.userId } as Ctx;
    },
  });
}

describe('the session, wired into the server', () => {
  it('hands ctxFor the verified session data and the agent identity', async () => {
    const sessions = createSessionStore<User>({ secret: SECRET });
    const seen: unknown[] = [];
    const server = serverWith(sessions, seen);

    await server.fetch(new Request('http://test/', { headers: { cookie: asCookie(sessions.issue({ userId: 'u1' })) } }));

    expect(seen).toEqual([{ session: { userId: 'u1' }, agent: null }]);
  });

  it('hands it no session when the cookie is missing or does not verify', async () => {
    const sessions = createSessionStore<User>({ secret: SECRET });
    const seen: unknown[] = [];
    const server = serverWith(sessions, seen);

    await server.fetch(new Request('http://test/', { headers: { cookie: 'janux_session=forged' } }));

    expect(seen).toEqual([{ session: undefined, agent: null }]);
  });

  it('sends the renewed cookie with the response when the session rotates', async () => {
    let now = 1_000_000;
    const sessions = createSessionStore<User>({ secret: SECRET, ttlMs: 10_000, rotateAfterMs: 500, now: () => now });
    const cookie = asCookie(sessions.issue({ userId: 'u1' }));
    const server = serverWith(sessions, []);
    const fresh = await server.fetch(new Request('http://test/', { headers: { cookie } }));

    expect(fresh.headers.get('set-cookie')).toBeNull();
    now += 600;
    const rotated = await server.fetch(new Request('http://test/', { headers: { cookie } }));

    expect(rotated.headers.get('set-cookie')).toStartWith('janux_session=');
    expect(sessions.read(new Request('http://test/', { headers: { cookie: asCookie(rotated.headers.get('set-cookie')!) } }))?.data)
      .toEqual({ userId: 'u1' });
  });

  it('renews on an invocation response too — the api surface is where a session is spent', async () => {
    let now = 1_000_000;
    const sessions = createSessionStore<User>({ secret: SECRET, ttlMs: 10_000, rotateAfterMs: 500, now: () => now });
    const cookie = asCookie(sessions.issue({ userId: 'u1' }));
    const server = serverWith(sessions, []);

    now += 600;
    const response = await server.fetch(
      new Request('http://test/_janux/api/echo.ping', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://test', cookie },
      }),
    );

    expect(response.headers.get('set-cookie')).toStartWith('janux_session=');
  });

  it('costs an app without sessions nothing: no read, no cookie, `ctxFor` as it always was', async () => {
    const seen: unknown[] = [];
    const server = createJanuxServer({
      routes: { '/': () => jsx('main', {}) },
      ctxFor: (_req, bag) => {
        seen.push(bag);

        return {};
      },
    });
    const response = await server.fetch(new Request('http://test/'));

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(seen).toEqual([{ session: undefined, agent: null }]);
  });
});
