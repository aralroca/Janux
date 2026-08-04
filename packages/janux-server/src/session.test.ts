import { describe, expect, it } from 'bun:test';
import { createSessionStore } from './session';

const SECRET = 'a-secret-that-never-leaves-the-server';

interface User {
  userId: string;
  scopes?: string[];
}

const withCookie = (cookie: string) => new Request('http://test/', { headers: { cookie } });

/** The `name=value` of a Set-Cookie line, ready to be sent back as a `cookie` header. */
const asCookie = (setCookie: string) => setCookie.split(';')[0]!;

describe('the session cookie', () => {
  it('round-trips the data it was issued with', () => {
    const sessions = createSessionStore<User>({ secret: SECRET });
    const issued = sessions.issue({ userId: 'u1', scopes: ['orders:read'] });

    expect(sessions.read(withCookie(asCookie(issued)))?.data).toEqual({ userId: 'u1', scopes: ['orders:read'] });
  });

  it('is signed: a tampered payload is not a session', () => {
    const sessions = createSessionStore<User>({ secret: SECRET });
    const cookie = asCookie(sessions.issue({ userId: 'u1', scopes: ['orders:read'] }));
    const forged = cookie.replace(
      /=([^.]+)/,
      `=${Buffer.from(JSON.stringify({ userId: 'u1', scopes: ['orders:write'] })).toString('base64url')}`,
    );

    expect(sessions.read(withCookie(forged))).toBeUndefined();
  });

  it('is bound to its secret: another server’s cookie does not verify here', () => {
    const cookie = asCookie(createSessionStore<User>({ secret: 'other' }).issue({ userId: 'u1' }));

    expect(createSessionStore<User>({ secret: SECRET }).read(withCookie(cookie))).toBeUndefined();
  });

  it('carries the hardening a session cookie needs, and says nothing about CSRF', () => {
    const issued = createSessionStore<User>({ secret: SECRET }).issue({ userId: 'u1' });

    expect(issued).toContain('Path=/');
    expect(issued).toContain('HttpOnly');
    expect(issued).toContain('Secure');
    expect(issued).toContain('SameSite=Lax');
    expect(issued).toContain('Max-Age=');
  });

  it('takes the app’s cookie attributes when it has an opinion', () => {
    const sessions = createSessionStore<User>({
      secret: SECRET,
      name: 'sid',
      sameSite: 'Strict',
      secure: false,
      domain: 'example.com',
      path: '/app',
    });
    const issued = sessions.issue({ userId: 'u1' });

    expect(issued.startsWith('sid=')).toBe(true);
    expect(issued).toContain('SameSite=Strict');
    expect(issued).toContain('Domain=example.com');
    expect(issued).toContain('Path=/app');
    expect(issued).not.toContain('Secure');
  });

  it('ignores a cookie header that carries other cookies too', () => {
    const sessions = createSessionStore<User>({ secret: SECRET });
    const cookie = asCookie(sessions.issue({ userId: 'u1' }));

    expect(sessions.read(withCookie(`JANUX_LOCALE=es; ${cookie}; theme=dark`))?.data.userId).toBe('u1');
  });

  it('is nothing at all when there is no cookie, or junk in its place', () => {
    const sessions = createSessionStore<User>({ secret: SECRET });

    expect(sessions.read(new Request('http://test/'))).toBeUndefined();
    expect(sessions.read(withCookie('janux_session=garbage'))).toBeUndefined();
    expect(sessions.read(withCookie('janux_session=a.b.c'))).toBeUndefined();
  });
});

describe('expiry and rotation', () => {
  it('expires: a session past its ttl is gone, signature or not', () => {
    let now = 1_000_000;
    const sessions = createSessionStore<User>({ secret: SECRET, ttlMs: 1_000, now: () => now });
    const cookie = asCookie(sessions.issue({ userId: 'u1' }));

    expect(sessions.read(withCookie(cookie))?.data.userId).toBe('u1');
    now += 1_001;
    expect(sessions.read(withCookie(cookie))).toBeUndefined();
  });

  it('does not renew a session that is still young', () => {
    const sessions = createSessionStore<User>({ secret: SECRET, ttlMs: 1_000, rotateAfterMs: 500 });

    expect(sessions.read(withCookie(asCookie(sessions.issue({ userId: 'u1' }))))?.renew).toBeUndefined();
  });

  /**
   * Rotation is what bounds the damage of a leaked cookie value: past the
   * window the value on the wire is replaced by a freshly signed one, so a
   * copy taken from a log or a proxy stops being usable without the user ever
   * having to log in again.
   */
  it('renews past the rotation window, with the same data under a new signature', () => {
    let now = 1_000_000;
    const sessions = createSessionStore<User>({ secret: SECRET, ttlMs: 10_000, rotateAfterMs: 500, now: () => now });
    const cookie = asCookie(sessions.issue({ userId: 'u1', scopes: ['orders:read'] }));

    now += 600;
    const read = sessions.read(withCookie(cookie))!;

    expect(read.data).toEqual({ userId: 'u1', scopes: ['orders:read'] });
    expect(read.renew).toBeDefined();
    expect(asCookie(read.renew!)).not.toBe(cookie);
    now += 9_500;
    // The window slid: the replaced value dies on its own schedule (nothing is
    // stored server-side to revoke it early), the renewed one outlives it.
    expect(sessions.read(withCookie(cookie))).toBeUndefined();
    expect(sessions.read(withCookie(asCookie(read.renew!)))?.data.userId).toBe('u1');
  });

  it('rotates on demand too — `issue` again is how a login stops a fixated session', () => {
    const sessions = createSessionStore<User>({ secret: SECRET });
    const anonymous = asCookie(sessions.issue({ userId: 'anon' }));
    const loggedIn = asCookie(sessions.issue({ userId: 'u1' }));

    expect(loggedIn).not.toBe(anonymous);
    expect(sessions.read(withCookie(loggedIn))?.data.userId).toBe('u1');
  });

  it('clears with a cookie the browser drops immediately', () => {
    const cleared = createSessionStore<User>({ secret: SECRET }).clear();

    expect(cleared).toContain('janux_session=;');
    expect(cleared).toContain('Max-Age=0');
  });
});
