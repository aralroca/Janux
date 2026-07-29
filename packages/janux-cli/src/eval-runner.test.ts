import { describe, expect, it } from 'bun:test';
import { deepSubset, resolveRefs, runScenario, type StepOutcome } from './eval-runner';

const outcomes: StepOutcome[] = [
  { status: 200, ok: true, result: { status: 'proposal', id: 'prop_1', nested: { total: 42 } } },
];

describe('resolveRefs', () => {
  it('resolves $steps references anywhere in a value', () => {
    const input = { id: '$steps[0].result.id', deep: ['$steps[0].result.nested.total'], plain: 'x' };

    expect(resolveRefs(input, outcomes)).toEqual({ id: 'prop_1', deep: [42], plain: 'x' });
  });

  it('throws on unresolvable references', () => {
    expect(() => resolveRefs('$steps[0].result.missing', outcomes)).toThrow('unresolvable');
  });
});

describe('deepSubset', () => {
  it('matches structural subsets and rejects mismatches', () => {
    expect(deepSubset({ a: { b: 1 } }, { a: { b: 1, c: 2 }, extra: true })).toBe(true);
    expect(deepSubset([{ id: 'p1' }], [{ id: 'p1', name: 'x' }, { id: 'p2' }])).toBe(true);
    expect(deepSubset({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('matches any array item via $some, independent of position', () => {
    expect(deepSubset({ items: { $some: { sku: 'MUG' } } }, { items: [{ sku: 'TSHIRT' }, { sku: 'MUG', stock: 4 }] })).toBe(true);
    expect(deepSubset({ items: { $some: { sku: 'GONE' } } }, { items: [{ sku: 'MUG' }] })).toBe(false);
    expect(deepSubset({ $some: { a: 1 } }, { a: 1 })).toBe(false);
  });

  it('negates a match via $not', () => {
    expect(deepSubset({ $not: { status: 'done' } }, { status: 'proposal' })).toBe(true);
    expect(deepSubset({ $not: { status: 'proposal' } }, { status: 'proposal' })).toBe(false);
    expect(deepSubset({ items: { $not: { $some: { stock: 0 } } } }, { items: [{ stock: 4 }] })).toBe(true);
  });

  it('treats $some/$not as single-key wrappers, never mixed with literal keys', () => {
    expect(deepSubset({ a: 1, $not: { a: 2 } }, { a: 1 })).toBe(false);
  });

  it('asserts a missing field via "$absent"', () => {
    expect(deepSubset({ discarded: '$absent' }, { status: 'proposal' })).toBe(true);
    expect(deepSubset({ discarded: '$absent' }, { discarded: 5 })).toBe(false);
  });
});

function fakeServer(): typeof fetch {
  const proposals = new Set<string>();
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  return (async (url: any, init: any) => {
    const body = JSON.parse(init.body);

    if (String(url).endsWith('/_janux/api/shop.pay')) {
      expect(init.headers['x-janux-origin']).toBe('agent');
      proposals.add('prop_9');

      return respond({ ok: true, result: { status: 'proposal', id: 'prop_9', tool: 'shop.pay', input: body } });
    }
    if (String(url).endsWith('/_janux/approve')) {
      return proposals.delete(body.id)
        ? respond({ ok: true, result: { charged: 5999 } })
        : respond({ ok: false, error: 'unknown proposal' }, 404);
    }
    if (String(url).endsWith('/_janux/reject')) {
      // Settlement is a human act: the runner must not send the agent header here.
      expect(init.headers['x-janux-origin']).toBeUndefined();

      return respond({ ok: proposals.delete(body.id) });
    }

    return respond({ ok: false, error: 'unknown api' }, 404);
  }) as typeof fetch;
}

describe('runScenario', () => {
  it('carries proposal ids into approve steps and passes', async () => {
    const report = await runScenario(
      {
        name: 'pay flow',
        steps: [
          { tool: 'api.shop.pay', input: { total: 5999 }, expect: { result: { status: 'proposal' } } },
          { approve: '$steps[0].result.id', expect: { result: { charged: 5999 } } },
        ],
      },
      'http://test',
      fakeServer(),
    );

    expect(report.pass).toBe(true);
    expect(report.steps.map((step) => step.pass)).toEqual([true, true]);
  });

  it('fails on unmet expectations with a detail', async () => {
    const report = await runScenario(
      { name: 'bad', steps: [{ tool: 'shop.pay', expect: { result: { status: 'done' } } }] },
      'http://test',
      fakeServer(),
    );

    expect(report.pass).toBe(false);
    expect(report.steps[0]?.detail).toContain('result mismatch');
  });

  it('settles a proposal through the reject path, mirroring approve', async () => {
    const report = await runScenario(
      {
        name: 'reject flow',
        steps: [
          { tool: 'api.shop.pay', input: { total: 5999 }, expect: { result: { status: 'proposal' } } },
          { reject: '$steps[0].result.id', expect: { ok: true } },
          { approve: '$steps[0].result.id', expect: { ok: false, status: 404 } },
          { reject: '$steps[0].result.id', expect: { ok: false } },
        ],
      },
      'http://test',
      fakeServer(),
    );

    expect(report.pass).toBe(true);
    expect(report.steps[1]?.label).toBe('reject $steps[0].result.id');
  });

  it('fails steps with unresolvable references without aborting the scenario', async () => {
    const report = await runScenario(
      { name: 'refs', steps: [{ approve: '$steps[5].result.id' }, { tool: 'shop.pay', expect: { result: { status: 'proposal' } } }] },
      'http://test',
      fakeServer(),
    );

    expect(report.steps[0]?.pass).toBe(false);
    expect(report.steps[1]?.pass).toBe(true);
  });
});
