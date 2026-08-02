import { afterEach, describe, expect } from 'bun:test';
import { api, createJanuxServer } from '@janux/server';
import { int, jsx, list, obj, schema, str } from 'janux';
import { runCases } from '../support/scenario';
import { JSON_BODY_CASES, type JsonBodyRow } from './json-body.cases';

/**
 * One server, one echoing api, and the row's bytes posted to it exactly as an
 * attacker would — through `server.fetch`, so the body travels the real path:
 * `req.json()`, the input schema, the audit entry, the JSON response.
 *
 * The echo is what makes stripping observable: whatever the validator kept comes
 * back, so an undeclared key that survives shows up in the assertion rather than
 * having to be inferred.
 */
const echo = api({
  description: 'Echoes its validated input',
  input: schema({
    q: str().default('none'),
    n: int().optional(),
    code: str().min(2).max(4).optional(),
    tags: list(str()).optional(),
    deep: obj({ inner: str() }).optional(),
  }),
  run: ({ input }) => input,
});

const server = createJanuxServer({ routes: { '/': () => jsx('main', {}) }, apis: { shop: { echo } } });

/** Same-origin, so the forgery guard is not what this file is measuring. */
function post(body: string): Promise<Response> {
  return server.fetch(
    new Request('http://test/_janux/api/shop.echo', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://test' },
    }),
  );
}

/** Anything a row managed to land on the prototype, so a leak cannot outlive its test. */
const PROBES = ['pwned', 'polluted', 'inner', 'prototype'];

afterEach(() => {
  PROBES.forEach((key) => delete (Object.prototype as Record<string, unknown>)[key]);
});

describe('json request bodies', () =>
  runCases(JSON_BODY_CASES, async (row: JsonBodyRow) => {
    const response = await post(row.body());

    expect(`${response.status} ${await response.text()}`).toBe(row.expected);
    // Every row, not only the pollution ones: a 200 that also wrote to the
    // prototype is a failure of the same call.
    PROBES.forEach((key) => expect(Object.prototype).not.toHaveProperty(key));
    expect(Object.keys({})).toEqual([]);
  }));
