import type { Case } from '../support/case';

/**
 * The JSON request body of an `api()` call, as bytes rather than as a value.
 *
 * `pollution.cases.ts` hands each entry point a key that a `JSON.parse` already
 * produced. This file starts one step earlier — at the wire — because the
 * interesting failures live in the gap between "what the attacker typed" and
 * "what the validator saw": `"__proto__"` is an own property after a parse but a
 * setter before one, a duplicate key silently keeps the last, a BOM makes the
 * whole body unparseable, and a body that is not an object at all reaches a
 * validator written for objects.
 *
 * Every row asserts the response the client gets *and* — in the runner, for all of
 * them — that `Object.prototype` is untouched afterwards. A 200 that also polluted
 * the prototype is not a pass.
 *
 * Sources: `nodejs:prototype-pollution` advisories, RFC 8259 §4 (duplicate names),
 * plus the stance Janux states in server.ts (`req.json().catch(() => ({}))`).
 */
export interface JsonBodyCase {
  /** The exact bytes sent as the request body. */
  body: () => string;
  /** `<status> <json>` — the whole envelope, because a client branches on it. */
  expected: string;
}

export type JsonBodyRow = Case<JsonBodyCase>;

const ok = (result: unknown) => `200 ${JSON.stringify({ ok: true, result })}`;
const invalid = (detail: string) => `400 ${JSON.stringify({ ok: false, error: `Error: Invalid input for "shop.echo" — ${detail}` })}`;
/** A body that never parsed is an empty one, so the input schema's defaults answer. */
const DEFAULTED = ok({ q: 'none' });

export const JSON_BODY_CASES: JsonBodyRow[] = [
  // ── prototype pollution, per key and per depth ──────────────────────────────
  {
    id: 'sec2-json-proto-at-the-top-level-is-stripped',
    src: 'nodejs:prototype-pollution',
    body: () => '{"__proto__":{"pwned":1},"q":"a"}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-proto-inside-a-declared-object-is-stripped',
    src: 'nodejs:prototype-pollution',
    body: () => '{"deep":{"__proto__":{"pwned":1},"inner":"x"}}',
    expected: ok({ q: 'none', deep: { inner: 'x' } }),
  },
  {
    id: 'sec2-json-proto-beside-a-declared-list-is-stripped',
    src: 'nodejs:prototype-pollution',
    body: () => '{"tags":["a"],"q":"b","__proto__":[]}',
    expected: ok({ q: 'b', tags: ['a'] }),
  },
  {
    id: 'sec2-json-proto-nested-five-levels-into-an-undeclared-branch',
    src: 'nodejs:prototype-pollution',
    body: () => '{"q":"a","junk":{"a":{"b":{"c":{"d":{"__proto__":{"pwned":1}}}}}}}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-a-constructor-key-is-stripped',
    src: 'nodejs:prototype-pollution',
    body: () => '{"constructor":{"prototype":{"pwned":1}},"q":"a"}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-a-prototype-key-is-stripped',
    src: 'nodejs:prototype-pollution',
    body: () => '{"prototype":{"pwned":1},"q":"a"}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-a-definegetter-key-is-stripped',
    src: 'nodejs:prototype-pollution',
    body: () => '{"__defineGetter__":"x","q":"a"}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-a-tostring-override-does-not-reach-the-validator',
    src: 'nodejs:prototype-pollution',
    body: () => '{"toString":"not a function","q":"a"}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-proto-carrying-a-string-instead-of-an-object',
    src: 'nodejs:prototype-pollution',
    body: () => '{"__proto__":"x","q":"a"}',
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-proto-inside-a-declared-list-item',
    src: 'nodejs:prototype-pollution',
    body: () => '{"tags":["a","b"],"deep":{"inner":"y","__proto__":{"pwned":1}}}',
    expected: ok({ q: 'none', tags: ['a', 'b'], deep: { inner: 'y' } }),
  },

  // ── keys that are not what they look like ───────────────────────────────────
  {
    id: 'sec2-json-a-unicode-escaped-key-still-names-its-field',
    src: 'rfc:8259#7',
    body: () => '{"\\u0071":"escaped"}',
    expected: ok({ q: 'escaped' }),
  },
  {
    id: 'sec2-json-a-duplicate-key-keeps-the-last-occurrence',
    src: 'rfc:8259#4',
    body: () => '{"q":"first","q":"last"}',
    expected: ok({ q: 'last' }),
  },
  {
    id: 'sec2-json-a-numeric-key-is-not-a-declared-field',
    src: 'janux',
    body: () => '{"1":"a","q":"b"}',
    expected: ok({ q: 'b' }),
  },
  {
    id: 'sec2-json-an-empty-key-is-not-a-declared-field',
    src: 'janux',
    body: () => '{"":"a","q":"b"}',
    expected: ok({ q: 'b' }),
  },
  {
    id: 'sec2-json-a-key-that-differs-only-in-case-is-undeclared',
    src: 'janux',
    body: () => '{"Q":"upper"}',
    expected: DEFAULTED,
  },
  {
    id: 'sec2-json-a-hundred-thousand-character-key-is-stripped-not-fatal',
    src: 'janux',
    body: () => `{"${'k'.repeat(100_000)}":1,"q":"a"}`,
    expected: ok({ q: 'a' }),
  },
  {
    id: 'sec2-json-five-thousand-undeclared-keys-are-stripped',
    src: 'janux',
    body: () => `{${Array.from({ length: 5000 }, (_, index) => `"k${index}":${index}`).join(',')},"q":"a"}`,
    expected: ok({ q: 'a' }),
  },

  // ── a body that is not an object ────────────────────────────────────────────
  {
    id: 'sec2-json-a-null-body-is-treated-as-an-empty-one',
    src: 'janux',
    body: () => 'null',
    expected: DEFAULTED,
  },
  {
    id: 'sec2-json-an-array-body-is-refused-as-a-non-object',
    src: 'janux',
    body: () => '[{"q":"a"}]',
    expected: invalid(': expected object'),
  },
  {
    id: 'sec2-json-a-string-body-is-refused-as-a-non-object',
    src: 'janux',
    body: () => '"q=a"',
    expected: invalid(': expected object'),
  },
  {
    id: 'sec2-json-a-number-body-is-refused-as-a-non-object',
    src: 'janux',
    body: () => '123',
    expected: invalid(': expected object'),
  },
  {
    id: 'sec2-json-a-boolean-body-is-refused-as-a-non-object',
    src: 'janux',
    body: () => 'true',
    expected: invalid(': expected object'),
  },

  // ── a body that never parsed ────────────────────────────────────────────────
  {
    id: 'sec2-json-an-empty-body-falls-back-to-the-schema-defaults',
    src: 'janux',
    body: () => '',
    expected: DEFAULTED,
  },
  {
    id: 'sec2-json-a-byte-order-mark-makes-the-whole-body-unparseable',
    src: 'janux',
    body: () => '﻿{"q":"a"}',
    expected: DEFAULTED,
  },
  {
    id: 'sec2-json-trailing-junk-after-a-valid-object-invalidates-it',
    src: 'janux',
    body: () => '{"q":"a"} and then some',
    expected: DEFAULTED,
  },
  {
    id: 'sec2-json-a-javascript-literal-is-not-json',
    src: 'janux',
    body: () => '{q: NaN}',
    expected: DEFAULTED,
  },
  {
    id: 'sec2-json-an-unterminated-object-is-not-json',
    src: 'janux',
    body: () => '{"q":"a"',
    expected: DEFAULTED,
  },

  // ── values that are the wrong shape ─────────────────────────────────────────
  {
    id: 'sec2-json-an-explicit-null-does-not-satisfy-a-non-nullable-field',
    src: 'janux',
    body: () => '{"q":null}',
    expected: invalid('q: not nullable'),
  },
  {
    id: 'sec2-json-a-nested-array-where-a-string-is-declared',
    src: 'janux',
    body: () => `{"q":${'['.repeat(200)}1${']'.repeat(200)}}`,
    expected: invalid('q: expected string'),
  },
  {
    id: 'sec2-json-an-overflowing-exponent-is-infinity-not-an-int',
    src: 'rfc:8259#6',
    body: () => '{"n":1e400}',
    expected: invalid('n: expected int'),
  },
  {
    id: 'sec2-json-negative-zero-is-an-integer',
    src: 'rfc:8259#6',
    body: () => '{"n":-0}',
    expected: ok({ q: 'none', n: 0 }),
  },
  {
    id: 'sec2-json-a-list-item-of-the-wrong-type-reports-its-index',
    src: 'janux',
    body: () => '{"tags":["a",2,"c"]}',
    expected: invalid('tags[1]: expected string'),
  },
  {
    id: 'sec2-json-a-missing-nested-field-reports-its-dotted-path',
    src: 'janux',
    body: () => '{"deep":{}}',
    expected: invalid('deep.inner: required'),
  },
  {
    id: 'sec2-json-every-broken-field-is-reported-not-just-the-first',
    src: 'janux',
    body: () => '{"q":1,"tags":"no"}',
    expected: invalid('q: expected string; tags: expected list'),
  },
  {
    id: 'sec2-json-a-string-under-its-minimum-length',
    src: 'janux',
    body: () => '{"code":"a"}',
    expected: invalid('code: below min 2'),
  },
  {
    id: 'sec2-json-a-string-over-its-maximum-length',
    src: 'janux',
    body: () => '{"code":"abcde"}',
    expected: invalid('code: above max 4'),
  },

  // ── values that survive the round trip exactly ──────────────────────────────
  {
    id: 'sec2-json-markup-in-a-value-is-carried-back-verbatim',
    src: 'janux',
    body: () => '{"q":"</script><script>alert(1)</script>"}',
    expected: ok({ q: '</script><script>alert(1)</script>' }),
  },
  {
    id: 'sec2-json-an-astral-character-survives-the-round-trip',
    src: 'rfc:8259#7',
    body: () => '{"q":"\\ud83d\\ude42"}',
    expected: ok({ q: '🙂' }),
  },
  {
    id: 'sec2-json-a-lone-surrogate-survives-as-a-replacement-free-string',
    src: 'rfc:8259#7',
    body: () => '{"q":"\\ud800"}',
    expected: ok({ q: '\ud800' }),
  },
  {
    id: 'sec2-json-a-nul-inside-a-value-is-not-a-terminator',
    src: 'janux',
    body: () => '{"q":"a\\u0000b"}',
    expected: ok({ q: 'a b' }),
  },
];
