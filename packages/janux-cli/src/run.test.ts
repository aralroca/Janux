import { beforeEach, describe, expect, it } from 'bun:test';
import { component, intent, jsx, list, money, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { runTool, type RunIo } from './run';

const charges: number[] = [];
const shipped: string[] = [];

const apis = {
  shop: {
    catalog: api({ description: 'List every product', run: () => ({ products: [{ id: 'p1' }] }) }),
    pay: api({
      description: 'Charge the cart. Irreversible.',
      input: schema({ total: money() }),
      guard: 'confirm',
      run: ({ input }) => {
        charges.push(input.total);

        return { orderId: 'ord_1', charged: input.total };
      },
    }),
    wipe: api({ description: 'Delete everything', guard: 'forbidden', run: () => 'gone' }),
  },
};

const cart = component({
  name: 'cart',
  description: 'A cart',
  state: schema({ items: list(str()), note: str().nullable() }),
  intents: {
    addItem: intent({
      description: 'Add a product to the cart by id',
      input: schema({ productId: str() }),
      run: ({ state, input }: any) => {
        state.items.push(input.productId);

        return { items: state.items.length };
      },
    }),
    ship: intent({
      description: 'Ship the cart. Irreversible.',
      input: schema({ address: str() }),
      guard: 'confirm',
      run: ({ input }: any) => {
        shipped.push(input.address);

        return { shipped: input.address };
      },
    }),
  },
  view: () => jsx('p', { children: 'cart' }),
});

const server = createJanuxServer({
  routes: { '/': () => jsx('main', {}), '/shop': () => jsx('div', { children: jsx(cart as any, {}) }) },
  apis,
});

const target = { server, ctx: {} };

function makeIo(answers: string[] = []): RunIo & { stdout: string; stderr: string; asked: string[] } {
  const io = {
    stdout: '',
    stderr: '',
    asked: [] as string[],
    out(text: string) {
      io.stdout += text;
    },
    err(text: string) {
      io.stderr += text;
    },
  };

  if (answers.length === 0) return io;

  return Object.assign(io, {
    ask(question: string) {
      io.asked.push(question);

      return answers.shift() ?? '';
    },
  });
}

beforeEach(() => {
  charges.length = 0;
  shipped.length = 0;
});

describe('janux run, with no tool', () => {
  it('lists what the manifest already advertises — intents and api() alike', async () => {
    const io = makeIo();
    const code = await runTool(target, [], io);

    expect(code).toBe(0);
    expect(io.stdout).toContain('cart.addItem');
    expect(io.stdout).toContain('api.shop.catalog');
    expect(io.stdout).toContain('confirm');
  });

  it('never advertises a forbidden tool — the CLI lists what an agent may call', async () => {
    const io = makeIo();

    await runTool(target, [], io);

    expect(io.stdout).not.toContain('api.shop.wipe');
  });
});

describe('janux run <tool>', () => {
  it('invokes an api() with guard auto and prints its result as JSON', async () => {
    const io = makeIo();
    const code = await runTool(target, ['api.shop.catalog'], io);

    expect(code).toBe(0);
    expect(JSON.parse(io.stdout)).toEqual({ products: [{ id: 'p1' }] });
  });

  it('invokes an intent with guard auto on the page that mounts it', async () => {
    const io = makeIo();
    const code = await runTool(target, ['cart.addItem', '--productId', 'p1'], io);

    expect(code).toBe(0);
    expect(JSON.parse(io.stdout)).toEqual({ items: 1 });
  });

  it('prints the usage the schema describes for --help', async () => {
    const io = makeIo();
    const code = await runTool(target, ['cart.addItem', '--help'], io);

    expect(code).toBe(0);
    expect(io.stdout).toContain('--productId <string>');
  });

  it('refuses an argument the tool never declared, and shows what it takes', async () => {
    const io = makeIo();
    const code = await runTool(target, ['cart.addItem', '--product', 'p1'], io);

    expect(code).toBe(1);
    expect(io.stderr).toContain('--product');
    expect(io.stderr).toContain('--productId <string>');
  });

  it('reports an unknown tool with the list of the ones that exist', async () => {
    const io = makeIo();
    const code = await runTool(target, ['cart.nope'], io);

    expect(code).toBe(1);
    expect(io.stderr).toContain('cart.nope');
    expect(io.stderr).toContain('cart.addItem');
  });

  it('lets the pipeline reject invalid input instead of validating twice', async () => {
    const io = makeIo();
    const code = await runTool(target, ['cart.addItem'], io);

    expect(code).toBe(1);
    expect(io.stderr).toContain('productId');
  });
});

describe('guard: confirm, from a terminal', () => {
  it('asks before charging, and charges once approved', async () => {
    const io = makeIo(['y']);
    const code = await runTool(target, ['api.shop.pay', '--total', '5999'], io);

    expect(io.asked[0]).toContain('api.shop.pay');
    expect(code).toBe(0);
    expect(charges).toEqual([5999]);
    expect(JSON.parse(io.stdout)).toEqual({ orderId: 'ord_1', charged: 5999 });
  });

  it('runs nothing when the human says no', async () => {
    const io = makeIo(['n']);
    const code = await runTool(target, ['api.shop.pay', '--total', '5999'], io);

    expect(code).toBe(1);
    expect(charges).toEqual([]);
  });

  it('asks before an intent runs, and executes the parked proposal once approved', async () => {
    const io = makeIo(['y']);
    const code = await runTool(target, ['cart.ship', '--address', 'Carrer Gran 1'], io);

    expect(io.asked[0]).toContain('cart.ship');
    expect(code).toBe(0);
    expect(shipped).toEqual(['Carrer Gran 1']);
  });

  it('leaves an intent proposal unexecuted when the human says no', async () => {
    const io = makeIo(['n']);
    const code = await runTool(target, ['cart.ship', '--address', 'Carrer Gran 1'], io);

    expect(code).toBe(1);
    expect(shipped).toEqual([]);
  });
});

describe('guard: confirm, with nobody at the terminal', () => {
  it('fails instead of auto-approving an api() call', async () => {
    const io = makeIo();
    const code = await runTool(target, ['api.shop.pay', '--total', '5999'], io);

    expect(code).toBe(1);
    expect(charges).toEqual([]);
    expect(io.stderr).toContain('confirm');
    expect(io.stdout).toBe('');
  });

  it('fails instead of auto-approving an intent', async () => {
    const io = makeIo();
    const code = await runTool(target, ['cart.ship', '--address', 'Carrer Gran 1'], io);

    expect(code).toBe(1);
    expect(shipped).toEqual([]);
    expect(io.stderr).toContain('confirm');
  });

  it('runs an auto-guarded tool unattended — CI is the whole point', async () => {
    const io = makeIo();
    const code = await runTool(target, ['api.shop.catalog'], io);

    expect(code).toBe(0);
  });
});

describe('a forbidden tool', () => {
  it('is refused even when named directly', async () => {
    const io = makeIo(['y']);
    const code = await runTool(target, ['api.shop.wipe'], io);

    expect(code).toBe(1);
    expect(io.stdout).toBe('');
  });
});
