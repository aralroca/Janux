import { describe, expect, it } from 'bun:test';
import { api, collectApis, createJanuxServer, isApi } from '@janux/server';
import { apiModuleName, apiStubModule, exportedApiNames } from '@janux/vite';
import { money, schema, str } from 'janux';

/**
 * guide/api-rpc.md promises one definition becomes three things. All three are
 * asserted here: the validated endpoint (in and out), the client stub the
 * compiler emits instead of the server module, and the manifest tool — plus the
 * conventions the page states about namespacing and what gets collected.
 */

const pay = api({
  description: 'Charge the cart. Irreversible monetary action.',
  input: schema({ total: money() }),
  output: schema({ orderId: str(), charged: money() }),
  guard: 'confirm',
  run: ({ input }: any) => ({ orderId: 'ord_1', charged: input.total }),
});

const broken = api({
  description: 'Returns an output that violates its own schema',
  output: schema({ orderId: str() }),
  run: () => ({ orderId: 42 }) as any,
});

const server = () => createJanuxServer({ apis: { shop: { pay, broken } } });

const post = (name: string, body: unknown, headers: Record<string, string> = {}) =>
  server().fetch(
    new Request(`http://test/_janux/api/${name}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    }),
  );

describe('guide/api-rpc.md — projection 1: the endpoint', () => {
  it('validates the input before run and the output after', async () => {
    const invalid = await post('shop.pay', { total: 25.5 }); // money() is minor units

    expect(invalid.status).toBe(400);
    const ok: any = await (await post('shop.pay', { total: 2500 })).json();

    expect(ok.result).toEqual({ orderId: 'ord_1', charged: 2500 });
    const badOutput = await post('shop.broken', {});

    expect(badOutput.status).toBe(500);
    expect((await badOutput.json()).error).toContain('invalid output');
  });

  it('is callable directly on the server, with no HTTP at all', async () => {
    expect(await pay({ total: 100 })).toEqual({ orderId: 'ord_1', charged: 100 });
  });
});

describe('guide/api-rpc.md — projection 2: the client stub', () => {
  it('compiles the module to fetch stubs, leaving no server code behind', () => {
    const source = `
      import { api } from '@janux/server';
      import { chargeInStripe } from './secret-vendor';
      const SECRET_RATE = 0.031;
      export const pay = api({ run: ({ input }) => chargeInStripe(input, SECRET_RATE) });
    `;
    const stub = apiStubModule('/app/src/server/shop.api.ts', source);

    expect(exportedApiNames(source)).toEqual(['pay']);
    expect(stub).toContain('clientApi');
    expect(stub).toContain('shop.pay');
    expect(stub).not.toContain('chargeInStripe');
    expect(stub).not.toContain('SECRET_RATE');
  });

  it('takes the namespace from the filename, as the conventions say', () => {
    expect(apiModuleName('/app/src/server/shop.api.ts')).toBe('shop');
  });
});

describe('guide/api-rpc.md — projection 3: the agent tool', () => {
  it('publishes name, description, schema and guard in the manifest', async () => {
    const manifest: any = await (await server().fetch(new Request('http://test/_janux/manifest?path=/'))).json();
    const tool = manifest.tools.find((candidate: any) => candidate.name === 'api.shop.pay');

    expect(tool).toMatchObject({ guard: 'confirm', description: 'Charge the cart. Irreversible monetary action.' });
    expect(tool.input).toMatchObject({ type: 'object' });
  });

  it('an agent call produces a proposal that approve executes exactly once', async () => {
    const app = server();
    const propose = async () =>
      (await (
        await app.fetch(
          new Request('http://test/_janux/api/shop.pay', {
            method: 'POST',
            body: JSON.stringify({ total: 2500 }),
            headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-janux-origin': 'agent' },
          }),
        )
      ).json()) as any;
    const approve = (id: string) =>
      app.fetch(
        new Request('http://test/_janux/approve', {
          method: 'POST',
          body: JSON.stringify({ id }),
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        }),
      );
    const { result } = await propose();

    expect(result).toMatchObject({ status: 'proposal', tool: 'shop.pay' });
    expect((await (await approve(result.id)).json()).result).toEqual({ orderId: 'ord_1', charged: 2500 });
    expect((await approve(result.id)).status).toBe(404); // exactly once
  });

  it('only exported api() values are collected', () => {
    const plainFunction = () => 'not an api';

    expect(isApi(pay)).toBe(true);
    expect(isApi(plainFunction)).toBe(false);
    expect(collectApis({ shop: { pay, plainFunction, SOME_CONSTANT: 3 } }).map((tool) => tool.name)).toEqual(['shop.pay']);
  });
});
