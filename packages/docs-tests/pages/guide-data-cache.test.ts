import { beforeAll, describe, expect, it } from 'bun:test';
import { createInstance, jsx, renderToString } from 'janux';
import { QueryClient } from 'janux/query';
import { docExample } from '../doc-example';

/**
 * guide/data-cache.md's Sessions island, run for real. The claim worth running
 * is the reactive key: the getter reads state inside the query's own effect, so
 * changing the filter switches cache entries and fetches the new one.
 */

const STUB = {
  "import { listSessions } from '../server/sessions.api';":
    'const listSessions = (vars: any) => (globalThis as any).__listSessions(vars);',
};

const calls: string[] = [];

(globalThis as any).__listSessions = async ({ status }: { status: string }) => {
  calls.push(status);

  return [{ id: `s-${status}`, name: `session ${status}` }];
};

let Sessions: any;

beforeAll(async () => {
  ({ Sessions } = await docExample('apps/docs/content/guide/data-cache.md', 1, STUB));
});

describe('guide/data-cache.md', () => {
  it('SSRs the pending branch and fetches the default key once', async () => {
    calls.length = 0;
    const { html } = await renderToString(jsx(Sessions, {}), { queryClient: new QueryClient() });

    expect(html).toContain('Loading…');
    expect(calls).toEqual(['all']);
  });

  it('a filter intent switches the observed cache entry to the new key', async () => {
    calls.length = 0;
    const client = new QueryClient();
    const instance = createInstance(Sessions, { ctx: { queryClient: client } });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    await instance.attach();
    instance.runInScope(() => Sessions.view(instance.bag)); // the view is where useQuery lives
    await flush();

    expect(client.getQueryData(['sessions', 'all'])).toEqual([{ id: 's-all', name: 'session all' }]);

    await instance.intents.filter({ status: 'paid' });
    await flush();

    expect(calls).toEqual(['all', 'paid']); // the key getter re-ran inside the query's own effect
    expect(client.getQueryData(['sessions', 'paid'])).toEqual([{ id: 's-paid', name: 'session paid' }]);
  });

  it('setQueryData takes the new value — an updater function would be stored as data', () => {
    const client = new QueryClient();

    client.getQuery({ queryKey: ['sessions', 'all'], queryFn: async () => [] as unknown[] });
    client.setQueryData(['sessions', 'all'], [{ id: 's1' }]);

    expect(client.getQueryData(['sessions', 'all'])).toEqual([{ id: 's1' }]);
    client.setQueryData(['sessions', 'all'], ((old: unknown[]) => old) as unknown);

    expect(typeof client.getQueryData(['sessions', 'all'])).toBe('function');
  });

  it('invalidateQueries refetches every matching entry, observed or not', async () => {
    const client = new QueryClient();
    const fetched: string[] = [];
    const seed = (key: readonly unknown[], label: string) =>
      client.getQuery({
        queryKey: key,
        queryFn: async () => {
          fetched.push(label);

          return label;
        },
      });

    await seed(['sessions', 'all'], 'all').fetch();
    await seed(['sessions', 'paid'], 'paid').fetch();
    await seed(['catalog'], 'catalog').fetch();
    fetched.length = 0;

    await client.invalidateQueries(['sessions']);

    expect(fetched.sort()).toEqual(['all', 'paid']);
  });
});
