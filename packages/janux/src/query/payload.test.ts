import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient } from './cache';
import { query } from './index';
import { createRoot } from '../signals';
import { hydrateQueries } from './payload';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

beforeEach(() => {
  delete (window as any).__JANUX_QUERY__;
});

/** What the server would have pushed for a resolved query. */
async function payloadFor(key: string, data: unknown) {
  const server = new QueryClient();

  await server.getQuery({ queryKey: [key], queryFn: async () => data }).fetch();

  return { entries: server.dehydrate(), expect: [] };
}

describe('streamed query payload', () => {
  it('applies the chunks that landed before the runtime loaded', async () => {
    const client = new QueryClient();

    (window as any).__JANUX_QUERY__ = [await payloadFor('products', ['a'])];
    hydrateQueries(client);

    expect(client.getQueryData<string[]>(['products'])).toEqual(['a']);
  });

  it('applies a chunk that lands after boot, straight through the same global', async () => {
    const client = new QueryClient();

    hydrateQueries(client);
    (window as any).__JANUX_QUERY__.push(await payloadFor('late', ['b']));

    expect(client.getQueryData<string[]>(['late'])).toEqual(['b']);
  });

  it('holds an announced query until its chunk lands, without requesting it', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => ['fetched']);

    (window as any).__JANUX_QUERY__ = [{ expect: ['["slow"]'] }];
    hydrateQueries(client);
    const handle = createRoot(() => query<string[]>({ queryKey: ['slow'], queryFn }, client));

    await Promise.resolve();
    expect(queryFn).not.toHaveBeenCalled();

    (window as any).__JANUX_QUERY__.push(await payloadFor('slow', ['streamed']));
    await Promise.resolve();

    expect(handle.data.value).toEqual(['streamed']);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('lets an announced query fetch once the document ends without it', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => ['fetched']);

    (window as any).__JANUX_QUERY__ = [{ expect: ['["orphan"]'] }];
    hydrateQueries(client);
    createRoot(() => query({ queryKey: ['orphan'], queryFn }, client));
    await Promise.resolve();
    expect(queryFn).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    await Promise.resolve();

    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
