import { cachePolicy } from 'janux';

/**
 * Declares itself public AND sets a session cookie — the exact mistake the
 * pipeline guard exists to catch, written the way a real app writes it by
 * accident (a public policy copied onto a route that later grew a login).
 */
export const cache = cachePolicy({ name: 'signin', scope: 'public', sharedMaxAge: '5m', tags: ['feed'] });

export function GET() {
  return new Response('welcome back', { headers: { 'set-cookie': 'session=abc123; HttpOnly; Path=/' } });
}
