import { bool, component, intent, list, schema, str } from 'janux';
import { getQueryClient } from 'janux/client';
import { revalidateCatalog } from '../server/products.api';

/**
 * Reads the cache headers of a real response, because that is the only honest
 * way to show this working: `x-janux-cache` says whether the shared cache
 * served it, `cache-control` says what a CDN is allowed to do with it, and
 * `cache-tag` says which word revalidates it.
 *
 * Same-origin, so every header is readable — a cross-origin fetch would only
 * expose the CORS-safelisted ones, `cache-control` among them but not the
 * other two.
 */
async function probe(path: string) {
  const res = await fetch(path, { headers: { 'x-cache-probe': '1' } });

  await res.text();

  return {
    path,
    state: res.headers.get('x-janux-cache') ?? '—',
    control: res.headers.get('cache-control') ?? '—',
    tag: res.headers.get('cache-tag') ?? '—',
  };
}

export const CacheProbe = component({
  name: 'cache-probe',
  description: 'Shows the cache headers a route actually answers with, and revalidates it by tag.',
  state: schema({
    rows: list({ path: str(), state: str(), control: str(), tag: str() }),
    busy: bool().default(false),
  }),
  intents: {
    check: intent({
      description: 'Fetch the public and the private route, and record their cache headers',
      run: async ({ state }: any) => {
        state.busy = true;
        state.rows = await Promise.all([probe('/catalog'), probe('/account')]);
        state.busy = false;
      },
    }),
    revalidate: intent({
      description: 'Revalidate everything tagged "catalog", then re-check the headers',
      run: async ({ state, intents }: any) => {
        state.busy = true;
        await revalidateCatalog({});
        // The client cache speaks the same word, so both halves drop together.
        await getQueryClient().invalidateTag('catalog');
        state.busy = false;
        await intents.check();
      },
    }),
  },
  view: ({ state, intents }: any) => (
    <section class="catalog">
      <div class="tags">
        <button class="tag" onClick={intents.check}>
          check headers
        </button>
        <button class="tag" onClick={intents.revalidate}>
          revalidate tag: catalog
        </button>
      </div>
      {state.busy ? <p class="loading">Probing…</p> : null}
      <ul class="items" id="cache-rows">
        {state.rows.map((row: any) => (
          <li class="item" key={row.path}>
            <code>{row.path}</code> — <b data-probe-state={row.path}>{row.state}</b>
            <br />
            <small data-probe-control={row.path}>{row.control}</small>
            <br />
            <small>tag: {row.tag}</small>
          </li>
        ))}
      </ul>
    </section>
  ),
});
