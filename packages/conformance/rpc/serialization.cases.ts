import type { Case } from '../support/case';

/**
 * What an `api()` result becomes on the wire.
 *
 * `api()` is one definition serving three callers — an HTTP endpoint, a typed
 * client stub and an agent tool — and only the first of them is JSON. That makes
 * the boundary easy to forget while writing a `run()`: a `Date` is a rich object
 * on the server and a string to the client, a `Map` is a container on the server
 * and `{}` to the client, and `undefined` is a value on the server and an absent
 * key to the client. Each of those is a bug report waiting to happen, so the
 * corpus states the answer instead of leaving it to be discovered.
 *
 * Two of them are not lossy but fatal: a `BigInt` and a cycle make
 * `JSON.stringify` throw, which the pipeline turns into a 500 rather than a
 * truncated body — a response that stops mid-object is worse than no response.
 *
 * Asserted as the exact response text, because that is what a client parses.
 */
export interface WireCase {
  /** What `run()` returns. Built lazily so each row gets a fresh value. */
  value: () => unknown;
  /** The whole response body, verbatim. */
  expected: string;
}

export type WireRow = Case<WireCase>;

const ok = (json: string) => `{"ok":true,"result":${json}}`;
const failed = (error: string) => `{"ok":false,"error":${JSON.stringify(error)}}`;

class Point {
  x = 1;
  private hidden = 'kept, because private is a type-level idea';

  get doubled(): number {
    return this.x * 2;
  }

  toString(): string {
    return 'Point';
  }
}

export const WIRE_CASES: WireRow[] = [
  // ── the plain values, so the lossy ones below stand out ─────────────────────
  { id: 'rpc-wire-a-string', src: 'janux', value: () => 'plain', expected: ok('"plain"') },
  { id: 'rpc-wire-an-empty-string', src: 'janux', value: () => '', expected: ok('""') },
  { id: 'rpc-wire-a-number', src: 'janux', value: () => 42, expected: ok('42') },
  { id: 'rpc-wire-zero', src: 'janux', value: () => 0, expected: ok('0') },
  { id: 'rpc-wire-false', src: 'janux', value: () => false, expected: ok('false') },
  { id: 'rpc-wire-null', src: 'janux', value: () => null, expected: ok('null') },
  { id: 'rpc-wire-an-empty-array', src: 'janux', value: () => [], expected: ok('[]') },
  { id: 'rpc-wire-an-empty-object', src: 'janux', value: () => ({}), expected: ok('{}') },
  {
    id: 'rpc-wire-a-nested-structure-keeps-its-shape',
    src: 'janux',
    value: () => ({ a: [1, { b: 'c' }], d: { e: [true, null] } }),
    expected: ok('{"a":[1,{"b":"c"}],"d":{"e":[true,null]}}'),
  },
  {
    id: 'rpc-wire-key-order-is-insertion-order',
    src: 'janux',
    value: () => ({ z: 1, a: 2 }),
    expected: ok('{"z":1,"a":2}'),
  },

  // ── absent is not null ──────────────────────────────────────────────────────
  {
    // `JSON.stringify(undefined)` is `undefined`, so the key vanishes from the
    // envelope entirely: a client reading `body.result` gets `undefined` either
    // way, and one reading `'result' in body` does not.
    id: 'rpc-wire-undefined-drops-the-result-key-entirely',
    src: 'janux',
    value: () => undefined,
    expected: '{"ok":true}',
  },
  {
    id: 'rpc-wire-an-undefined-field-is-dropped-from-an-object',
    src: 'janux',
    value: () => ({ kept: 1, gone: undefined }),
    expected: ok('{"kept":1}'),
  },
  {
    id: 'rpc-wire-an-undefined-item-becomes-null-in-an-array',
    src: 'janux',
    value: () => [1, undefined, 3],
    expected: ok('[1,null,3]'),
  },
  {
    id: 'rpc-wire-an-array-hole-becomes-null',
    src: 'janux',
    // eslint-disable-next-line no-sparse-arrays
    value: () => [1, , 3],
    expected: ok('[1,null,3]'),
  },
  {
    id: 'rpc-wire-a-function-field-is-dropped',
    src: 'janux',
    value: () => ({ kept: 1, run: () => 'nope' }),
    expected: ok('{"kept":1}'),
  },
  {
    id: 'rpc-wire-a-symbol-field-is-dropped',
    src: 'janux',
    value: () => ({ kept: 1, [Symbol('s')]: 'nope' }),
    expected: ok('{"kept":1}'),
  },

  // ── the rich types that flatten ─────────────────────────────────────────────
  {
    id: 'rpc-wire-a-date-becomes-an-iso-string',
    src: 'janux',
    value: () => new Date('2020-01-02T03:04:05.000Z'),
    expected: ok('"2020-01-02T03:04:05.000Z"'),
  },
  {
    id: 'rpc-wire-an-invalid-date-becomes-null',
    src: 'janux',
    value: () => new Date('not a date'),
    expected: ok('null'),
  },
  {
    id: 'rpc-wire-a-map-becomes-an-empty-object',
    src: 'janux',
    value: () => new Map([['a', 1]]),
    expected: ok('{}'),
  },
  {
    id: 'rpc-wire-a-set-becomes-an-empty-object',
    src: 'janux',
    value: () => new Set([1, 2]),
    expected: ok('{}'),
  },
  {
    id: 'rpc-wire-a-map-nested-in-a-result-is-just-as-empty',
    src: 'janux',
    value: () => ({ byId: new Map([['a', 1]]) }),
    expected: ok('{"byId":{}}'),
  },
  {
    id: 'rpc-wire-a-regexp-becomes-an-empty-object',
    src: 'janux',
    value: () => /pattern/gi,
    expected: ok('{}'),
  },
  {
    id: 'rpc-wire-an-error-becomes-an-empty-object',
    src: 'janux',
    value: () => new Error('leaky internal detail'),
    expected: ok('{}'),
  },
  {
    id: 'rpc-wire-a-url-becomes-its-href',
    src: 'janux',
    value: () => new URL('https://example.test/a?b=1'),
    expected: ok('"https://example.test/a?b=1"'),
  },
  {
    id: 'rpc-wire-a-typed-array-becomes-an-index-keyed-object',
    src: 'janux',
    value: () => new Uint8Array([1, 2, 3]),
    expected: ok('{"0":1,"1":2,"2":3}'),
  },
  {
    id: 'rpc-wire-a-class-instance-keeps-own-fields-and-drops-getters',
    src: 'janux',
    value: () => new Point(),
    expected: ok('{"x":1,"hidden":"kept, because private is a type-level idea"}'),
  },
  {
    id: 'rpc-wire-a-tojson-hook-wins-over-the-object',
    src: 'janux',
    value: () => ({ secret: 1, toJSON: () => 'redacted' }),
    expected: ok('"redacted"'),
  },
  {
    id: 'rpc-wire-a-response-object-is-not-a-response',
    src: 'janux',
    value: () => new Response('body bytes'),
    expected: ok('{}'),
  },
  {
    id: 'rpc-wire-a-readable-stream-is-not-streamed',
    src: 'janux',
    value: () => new ReadableStream(),
    expected: ok('{}'),
  },
  {
    id: 'rpc-wire-a-promise-returned-by-run-is-awaited',
    src: 'janux',
    value: () => Promise.resolve({ resolved: true }),
    expected: ok('{"resolved":true}'),
  },
  {
    id: 'rpc-wire-a-promise-nested-in-a-result-is-not-awaited',
    src: 'janux',
    value: () => ({ pending: Promise.resolve(1) }),
    expected: ok('{"pending":{}}'),
  },

  // ── numbers JSON cannot spell ───────────────────────────────────────────────
  { id: 'rpc-wire-nan-becomes-null', src: 'janux', value: () => Number.NaN, expected: ok('null') },
  {
    id: 'rpc-wire-infinity-becomes-null',
    src: 'janux',
    value: () => Number.POSITIVE_INFINITY,
    expected: ok('null'),
  },
  {
    id: 'rpc-wire-an-overflowing-literal-becomes-null',
    src: 'janux',
    value: () => 1e400,
    expected: ok('null'),
  },
  {
    id: 'rpc-wire-negative-zero-loses-its-sign',
    src: 'janux',
    value: () => -0,
    expected: ok('0'),
  },
  {
    id: 'rpc-wire-an-unsafe-integer-is-sent-as-written-and-arrives-rounded',
    src: 'janux',
    value: () => 9007199254740993,
    expected: ok('9007199254740992'),
  },
  {
    id: 'rpc-wire-a-tiny-float-keeps-exponent-notation',
    src: 'janux',
    value: () => 1e-7,
    expected: ok('1e-7'),
  },

  // ── strings that mean something to a parser downstream ──────────────────────
  {
    // The response is `application/json`, not markup: escaping `<` here would be
    // a lie about what the client receives. The HTML shell is where that matters,
    // and it has its own escaper (`safeJson`).
    id: 'rpc-wire-markup-in-a-string-is-not-html-escaped',
    src: 'janux',
    value: () => '</script><script>alert(1)</script>',
    expected: ok('"</script><script>alert(1)</script>"'),
  },
  {
    id: 'rpc-wire-a-line-separator-is-carried-raw',
    src: 'janux',
    value: () => 'a b',
    expected: ok('"a b"'),
  },
  {
    id: 'rpc-wire-a-lone-surrogate-is-escaped-rather-than-replaced',
    src: 'ecma:well-formed-json-stringify',
    value: () => '\ud800',
    expected: ok('"\\ud800"'),
  },
  {
    id: 'rpc-wire-a-nul-is-escaped',
    src: 'janux',
    value: () => 'a b',
    expected: ok('"a\\u0000b"'),
  },
  {
    id: 'rpc-wire-an-astral-character-is-carried-raw',
    src: 'janux',
    value: () => '🙂',
    expected: ok('"🙂"'),
  },

  // ── what cannot be serialized at all ────────────────────────────────────────
  {
    id: 'rpc-wire-a-bigint-fails-the-call-rather-than-truncating-the-body',
    src: 'janux',
    value: () => 1n,
    expected: failed('TypeError: JSON.stringify cannot serialize BigInt.'),
  },
  {
    id: 'rpc-wire-a-bigint-nested-in-a-result-fails-it-too',
    src: 'janux',
    value: () => ({ total: 1n }),
    expected: failed('TypeError: JSON.stringify cannot serialize BigInt.'),
  },
  {
    id: 'rpc-wire-a-cycle-fails-the-call',
    src: 'janux',
    value: () => {
      const cyclic: Record<string, unknown> = { name: 'root' };

      cyclic.self = cyclic;

      return cyclic;
    },
    expected: failed('TypeError: JSON.stringify cannot serialize cyclic structures.'),
  },
  {
    id: 'rpc-wire-a-shared-reference-is-not-a-cycle',
    src: 'janux',
    value: () => {
      const shared = { id: 1 };

      return { a: shared, b: shared };
    },
    expected: ok('{"a":{"id":1},"b":{"id":1}}'),
  },
  {
    id: 'rpc-wire-a-throwing-tojson-fails-the-call',
    src: 'janux',
    value: () => ({
      toJSON: () => {
        throw new Error('toJSON exploded');
      },
    }),
    expected: failed('Error: toJSON exploded'),
  },
];
