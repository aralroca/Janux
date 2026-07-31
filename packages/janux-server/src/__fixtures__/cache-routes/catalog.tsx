import { cachePolicy, jsx } from 'janux';

export const cache = cachePolicy({
  name: 'catalog',
  scope: 'public',
  maxAge: '10s',
  sharedMaxAge: '5m',
  swr: '1h',
  tags: ['catalog'],
});

export default function Catalog() {
  return jsx('main', { children: 'Catalog' });
}
