import { cachePolicy } from 'janux';

export const cache = cachePolicy({ name: 'feed', scope: 'public', sharedMaxAge: '2m', tags: ['feed'] });

export function GET() {
  return Response.json({ items: ['a', 'b'] });
}
