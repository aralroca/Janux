import { beforeAll, describe, expect, it } from 'bun:test';
import { createInstance, jsx, renderToString } from 'janux';
import { QueryClient, getQueryClient } from 'janux/query';
import { docExample } from '../doc-example';

/**
 * recipes/optimistic-ui.md runs for real: the documented island is extracted,
 * its server module stubbed, and the optimistic write / rollback / settle cycle
 * driven through the intent pipeline — including the silent no-op that makes an
 * optimistic update disappear when nothing has read the key yet.
 */

const STUB = {
  "import { addTodo, listTodos } from '../server/todos.api';": [
    'const addTodo = (vars: any) => (globalThis as any).__addTodo(vars);',
    'const listTodos = () => (globalThis as any).__listTodos();',
  ].join('\n'),
};

const KEY = ['todos'];
const client = getQueryClient();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let serverTasks: Array<{ text: string }> = [];
let addTodo: (vars: { text: string }) => Promise<unknown> = async (vars) => vars;

(globalThis as any).__addTodo = (vars: { text: string }) => addTodo(vars);
(globalThis as any).__listTodos = async () => [...serverTasks];

let page: any;

beforeAll(async () => {
  page = await docExample('apps/docs/content/recipes/optimistic-ui.md', 0, STUB);
});

/** What a mounted island does: the view's useQuery creates the entry, then it holds `tasks`. */
async function seed(tasks: Array<{ text: string }>) {
  serverTasks = tasks;
  await renderToString(jsx(page.Todos, {}), {});
  await client.invalidateQueries(KEY);
}

describe('recipes/optimistic-ui.md', () => {
  it('the view is what creates the cache entry the mutation writes into', async () => {
    await seed([{ text: 'ship it' }]);

    expect(client.getQueryData(KEY)).toEqual([{ text: 'ship it' }]);
  });

  it('shows the task before the server confirms it, then settles on server truth', async () => {
    await seed([{ text: 'ship it' }]);
    let confirm = () => {};

    addTodo = (vars) =>
      new Promise((resolve) => {
        confirm = () => {
          serverTasks.push(vars);
          resolve(vars);
        };
      });
    const instance = createInstance(page.Todos);

    await instance.attach();
    const inFlight = instance.intents.add({ text: 'later' });

    await flush();

    expect(client.getQueryData(KEY)).toEqual([{ text: 'ship it' }, { text: 'later', pending: true }]);
    expect(page.addTask.isPending.value).toBe(true);

    confirm();
    await inFlight;
    await flush();

    expect(client.getQueryData(KEY)).toEqual([{ text: 'ship it' }, { text: 'later' }]);
    expect(page.addTask.isPending.value).toBe(false);
  });

  it('puts the previous value back when the mutation rejects', async () => {
    await seed([{ text: 'ship it' }]);
    addTodo = async () => {
      throw new Error('offline');
    };
    const instance = createInstance(page.Todos);

    await instance.attach();

    await expect(instance.intents.add({ text: 'nope' })).rejects.toThrow('offline');
    expect(client.getQueryData(KEY)).toEqual([{ text: 'ship it' }]);
  });

  it('setQueryData on a key nothing has read is a silent no-op', () => {
    const fresh = new QueryClient();

    fresh.setQueryData(KEY, [{ text: 'buy milk' }]);

    expect(fresh.getQueryData(KEY)).toBeUndefined();
    fresh.getQuery({ queryKey: KEY, queryFn: async () => [] });
    fresh.setQueryData(KEY, [{ text: 'buy milk' }]);

    expect(fresh.getQueryData(KEY)).toEqual([{ text: 'buy milk' }]);
  });
});
