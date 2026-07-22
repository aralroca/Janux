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
});

function fakeServer(): typeof fetch {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  return (async (url: any, init: any) => {
    const body = JSON.parse(init.body);

    if (String(url).endsWith('/_janux/api/shop.pay')) {
      expect(init.headers['x-janux-origin']).toBe('agent');

      return respond({ ok: true, result: { status: 'proposal', id: 'prop_9', tool: 'shop.pay', input: body } });
    }
    if (String(url).endsWith('/_janux/approve')) {
      return body.id === 'prop_9'
        ? respond({ ok: true, result: { charged: 5999 } })
        : respond({ ok: false, error: 'unknown proposal' }, 404);
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
