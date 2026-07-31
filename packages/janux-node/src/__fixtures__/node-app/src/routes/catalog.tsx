import { cachePolicy, jsx } from 'janux';

/**
 * The cache model is runtime-agnostic on paper — this route is how that stops
 * being a claim. Everything it exercises (streamed body teeing, the tag header,
 * the shared copy Janux keeps) runs under Node here, not under Bun.
 */
export const cache = cachePolicy({
  name: 'node-catalog',
  scope: 'public',
  maxAge: '0s',
  sharedMaxAge: '1m',
  swr: '5m',
  tags: ['catalog'],
});

export default function Catalog() {
  return jsx('main', { children: `catalog rendered at ${Date.now()}` });
}
