import { component, jsx, source } from 'janux';

/** Shared island definitions for the streaming fixture app (`_` = not a route). */

const after = <T,>(ms: number, value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/** Slow enough to lose the inline race, fast enough that a test never waits long. */
export const slowList = component({
  name: 'slow-list',
  sources: { rows: source({ query: () => after(20, ['a', 'b']) }) },
  suspense: () => jsx('p', { children: 'loading' }),
  view: ({ sources }: any) => jsx('p', { children: `rows:${sources.rows.value.length}` }),
});

/** Never settles: the page is permanently mid-stream until the response is abandoned. */
export const stuck = component({
  name: 'stuck-list',
  sources: { rows: source({ query: () => new Promise<string[]>(() => undefined) }) },
  suspense: () => jsx('p', { children: 'stuck' }),
  view: () => jsx('p', { children: 'never' }),
});

/** Throws only once the page's own markup is already on the wire. */
export const lateBoom = () => {
  throw new Error('late render failure');
};
