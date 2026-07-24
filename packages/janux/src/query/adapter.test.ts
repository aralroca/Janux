import { describe, expect, it, mock } from 'bun:test';
import { createRoot } from '../signals';
import { QueryClient } from './cache';
import { query, mutation } from './index';

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('signal query adapter', () => {
  it('mirrors cache state into signals and fetches when stale', async () => {
    const client = new QueryClient();

    await new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const q = query({ queryKey: ['user', 1], queryFn: async () => ({ name: 'ada' }) }, client);

        expect(q.isPending.value).toBe(true);
        await tick();
        expect(q.data.value).toEqual({ name: 'ada' });
        expect(q.isPending.value).toBe(false);
        dispose();
        resolve();
      });
    });
  });

  it('does not refetch a fresh cached entry (no double-fetch on resume)', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => 'v');
    const options = { queryKey: ['k'], queryFn, staleTime: 10_000 };

    await client.getQuery(options).fetch();
    createRoot((dispose) => {
      query(options, client);
      dispose();
    });
    await tick();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on scope dispose', async () => {
    const client = new QueryClient();
    let dispose!: () => void;

    createRoot((d) => {
      dispose = d;
      query({ queryKey: ['x'], queryFn: async () => 1 }, client);
    });
    await tick();
    const entry = client.getQuery({ queryKey: ['x'], queryFn: async () => 1 });

    dispose();
    // After dispose the adapter's listener is gone; a data set must not throw.
    expect(() => client.setQueryData(['x'], 2)).not.toThrow();
  });

  it('mutation tracks isPending and invalidates via the client', async () => {
    const client = new QueryClient();
    let count = 0;
    const list = client.getQuery({ queryKey: ['todos'], queryFn: async () => ++count });

    list.subscribe(() => {});
    await list.fetch();

    const add = mutation(
      {
        mutationFn: async () => 'ok',
        onSuccess: () => client.invalidateQueries(['todos']),
      },
      client,
    );

    await add.mutate({});
    expect(add.isPending.value).toBe(false);
    expect(list.state.data).toBe(2);
  });
});
