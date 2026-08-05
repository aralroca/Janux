import { describe, expect, it } from 'bun:test';
import { schema, str, type AuditEntry } from 'janux';
import { api, invokeApi, resolveApiGuard, type ApiTool } from './api';
import { createJanuxServer } from './server';

const payDef = api({
  description: 'Charge the card.',
  effect: 'irreversible',
  input: schema({ amount: str() }),
  run: ({ input, origin }) => ({ charged: input.amount, origin }),
});
const lookupDef = api({ input: schema({ q: str() }), run: ({ input }) => ({ found: input.q }) });

const pay: ApiTool = { ...payDef, name: 'shop.pay' };
const lookup: ApiTool = { ...lookupDef, name: 'shop.lookup' };

describe('resolveApiGuard under taint', () => {
  it('is unchanged without taint', () => {
    expect(resolveApiGuard(pay, {}, 'agent')).toBe('auto');
    expect(resolveApiGuard(pay, {}, { origin: 'agent' })).toBe('auto');
  });

  it('degrades an irreversible auto tool reached from untrusted content', () => {
    expect(resolveApiGuard(pay, {}, { origin: 'agent', tainted: true })).toBe('confirm');
    expect(resolveApiGuard(lookup, {}, { origin: 'agent', tainted: true })).toBe('auto');
  });
});

describe('invokeApi under taint', () => {
  it('a tainted chain runs as agent, whatever the caller claimed', async () => {
    const audit: AuditEntry[] = [];
    const result: any = await invokeApi(lookup, { q: 'x' }, {}, { origin: 'human', tainted: true }, (entry) =>
      audit.push(entry),
    );

    expect(result.found).toBe('x');
    expect(audit[0]).toMatchObject({ origin: 'agent', tainted: true });
  });

  it('leaves an ordinary human call alone', async () => {
    const audit: AuditEntry[] = [];

    await invokeApi(lookup, { q: 'x' }, {}, 'human', (entry) => audit.push(entry));

    expect(audit[0]).toMatchObject({ origin: 'human' });
    expect(audit[0]!.tainted).toBeUndefined();
  });
});

const server = createJanuxServer({ routes: {}, apis: { shop: { pay: payDef, lookup: lookupDef } } });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    }),
  );

describe('POST /_janux/api under taint', () => {
  it('runs an irreversible auto tool for an ordinary agent call', async () => {
    const body: any = await post('/_janux/api/shop.pay', { amount: '10' }, { 'x-janux-origin': 'agent' }).then((r) => r.json());

    expect(body.result.charged).toBe('10');
  });

  /** The transport declares the taint; the pipeline is what acts on it. */
  it('parks the same call for a human when the chain is tainted', async () => {
    const body: any = await post(
      '/_janux/api/shop.pay',
      { amount: '10' },
      { 'x-janux-origin': 'agent', 'x-janux-tainted': '1' },
    ).then((r) => r.json());

    expect(body.result.status).toBe('proposal');
    expect(body.result.tool).toBe('shop.pay');
  });

  it('a tainted call that claims no agent origin is still not human', async () => {
    const body: any = await post('/_janux/api/shop.pay', { amount: '10' }, { 'x-janux-tainted': '1' }).then((r) => r.json());

    expect(body.result.status).toBe('proposal');
  });

  it('does not gate a reversible tool under taint', async () => {
    const body: any = await post(
      '/_janux/api/shop.lookup',
      { q: 'x' },
      { 'x-janux-origin': 'agent', 'x-janux-tainted': '1' },
    ).then((r) => r.json());

    expect(body.result.found).toBe('x');
  });
});
