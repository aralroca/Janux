import { describe, expect, it } from 'bun:test';
import { apiModuleName, apiStubModule, exportedApiNames } from './api-stubs';

const serverCode = `
import { api, schema } from '@janux/server';
import { db } from './db';

const PAGE_SIZE = 20;

export const searchOrders = api({
  input: schema({ q: str() }),
  run: async ({ input }) => db.search(input.q, PAGE_SIZE),
});

export const refundOrder = api({ guard: 'confirm', run: () => db.refund() });

function helper() {}
`;

describe('api client stubs (SWC)', () => {
  it('extracts only exported const names', () => {
    expect(exportedApiNames(serverCode)).toEqual(['searchOrders', 'refundOrder']);
  });

  it('derives the module namespace from the filename', () => {
    expect(apiModuleName('/app/src/server/shop.api.ts')).toBe('shop');
  });

  it('rejects unsupported export shapes instead of silently dropping them', () => {
    expect(() => exportedApiNames('export default api({ run: () => 1 });')).toThrow(/only support/);
    expect(() => exportedApiNames('export function foo() {}')).toThrow(/only support/);
    expect(() => exportedApiNames('const a = 1; export { a };')).toThrow(/only support/);
    expect(() => exportedApiNames('export const { a } = obj;')).toThrow(/destructured/);
    expect(exportedApiNames('export type X = string; export const ok = api({run(){}});')).toEqual(['ok']);
  });

  it('emits fetch stubs and never leaks server code to the client', () => {
    const stub = apiStubModule('/app/src/server/shop.api.ts', serverCode);

    expect(stub).toContain(`export const searchOrders = clientApi("shop.searchOrders");`);
    expect(stub).toContain(`export const refundOrder = clientApi("shop.refundOrder");`);
    expect(stub).not.toContain('db.search');
    expect(stub).not.toContain('PAGE_SIZE');
  });
});
