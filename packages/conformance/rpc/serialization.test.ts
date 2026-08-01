import { afterAll, describe, expect } from 'bun:test';
import { api, createJanuxServer } from '@janux/server';
import { jsx } from 'janux';
import { setOnError } from 'janux/observability';
import { runCases } from '../support/scenario';
import { WIRE_CASES, type WireRow } from './serialization.cases';

/**
 * Each row builds a one-api server whose `run()` returns the row's value, posts to
 * it, and compares the response body byte for byte — the client's view, which is
 * the only view this file is about.
 *
 * A serialization failure is a real error and reaches `onError`; it is silenced
 * here rather than left to print a stack per row, and the silencing is scoped so
 * an unexpected error still shows up as a failed assertion on the body.
 */
setOnError(() => undefined);
// Global state: restored so the silencing does not outlive this file.
afterAll(() => setOnError(undefined));

function serverFor(row: WireRow): ReturnType<typeof createJanuxServer> {
  return createJanuxServer({
    routes: { '/': () => jsx('main', {}) },
    apis: { shop: { produce: api({ description: 'Returns the row value', run: () => row.value() }) } },
  });
}

describe('api() result on the wire', () =>
  runCases(WIRE_CASES, async (row) => {
    const response = await serverFor(row).fetch(
      new Request('http://test/_janux/api/shop.produce', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://test' },
      }),
    );

    expect(await response.text()).toBe(row.expected);
  }));
