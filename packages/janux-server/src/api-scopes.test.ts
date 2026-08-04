import { describe, expect, it } from 'bun:test';
import { api, apiManifestTools, collectApis, invokeApi, resolveApiGuard } from './api';

/**
 * The `api()` half of scope authorization. The intent half lives in
 * `janux/src/runtime/scopes.test.ts`; both meet in the conformance corpus
 * (`security/tool-scopes.cases.ts`), which asserts the three transports.
 */

const READ_ONLY = { scopes: ['orders:read'] };

const orders = () =>
  collectApis({
    orders: {
      list: api({ description: 'List orders', scopes: ['orders:read'], run: () => 'LISTED' }),
      refund: api({ description: 'Refund an order', scopes: ['orders:write'], run: () => 'REFUNDED' }),
    },
  });

const toolNamed = (name: string) => orders().find((tool) => tool.name === name)!;

describe('an out-of-scope api', () => {
  it('resolves as forbidden, whichever origin asks', () => {
    expect(resolveApiGuard(toolNamed('orders.refund'), READ_ONLY, 'agent')).toBe('forbidden');
    expect(resolveApiGuard(toolNamed('orders.refund'), READ_ONLY, 'human')).toBe('forbidden');
    expect(resolveApiGuard(toolNamed('orders.list'), READ_ONLY, 'agent')).toBe('auto');
  });

  it('is absent from the manifest the context can see', () => {
    expect(apiManifestTools(orders(), READ_ONLY).map((tool) => tool.name)).toEqual(['api.orders.list']);
  });

  it('is refused when invoked, as a human as much as as an agent', () => {
    expect(invokeApi(toolNamed('orders.refund'), {}, READ_ONLY, 'agent')).rejects.toThrow(
      'Tool "orders.refund" is not available',
    );
    expect(invokeApi(toolNamed('orders.refund'), {}, READ_ONLY, 'human')).rejects.toThrow(
      'Tool "orders.refund" is not available',
    );
  });

  it('runs for a context that carries the scope', async () => {
    expect(await invokeApi(toolNamed('orders.list'), {}, READ_ONLY, 'agent')).toBe('LISTED');
  });
});
