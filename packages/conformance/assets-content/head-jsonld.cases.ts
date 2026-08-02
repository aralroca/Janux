import type { PageMeta } from 'janux';
import type { Case } from '../support/case';

/**
 * JSON-LD: a data block that a strict CSP still sees as a `<script>`.
 *
 * Hence the two rules. Each entry is serialised with `<` escaped as `\u003c`,
 * because inside a script element the parser is looking for `</script` and not
 * for JSON — an entity would corrupt the data while leaving the hole open, so
 * the escape has to happen in the JSON layer instead. And each block carries
 * the request nonce, which the app cannot write itself.
 *
 * One entry or many is the author's choice, not two code paths: a bare value is
 * one script, an array is one script per element, and the ids number from zero
 * either way.
 */
export interface JsonLdCase {
  jsonLd: PageMeta['jsonLd'];
  nonce?: string;
  /** Only the JSON-LD part of the output. */
  expected: string;
}

export type JsonLdRow = Case<JsonLdCase>;

const script = (index: number, body: string, nonce = '') =>
  `<script type="application/ld+json" id="jx-jsonld-${index}"${nonce}>${body}</script>`;

export const JSONLD_CASES: JsonLdRow[] = [
  {
    id: 'head-jsonld-single-object',
    src: 'janux',
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', name: 'A' },
    expected: script(0, '{"@context":"https://schema.org","@type":"Article","name":"A"}'),
  },
  {
    id: 'head-jsonld-array-numbers-each-block',
    src: 'janux',
    jsonLd: [{ '@type': 'Article' }, { '@type': 'BreadcrumbList' }],
    expected: script(0, '{"@type":"Article"}') + script(1, '{"@type":"BreadcrumbList"}'),
  },
  {
    /** A one-element array is still an array: one block, same as the bare value. */
    id: 'head-jsonld-single-element-array',
    src: 'janux',
    jsonLd: [{ '@type': 'Person' }],
    expected: script(0, '{"@type":"Person"}'),
  },
  {
    id: 'head-jsonld-nothing-to-say',
    src: 'janux',
    jsonLd: undefined,
    expected: '',
  },
  {
    id: 'head-jsonld-empty-array-emits-nothing',
    src: 'janux',
    jsonLd: [],
    expected: '',
  },
  {
    /** `null` is a value an author chose to serialise, unlike an absent field. */
    id: 'head-jsonld-null-is-a-value',
    src: 'janux',
    jsonLd: null,
    expected: script(0, 'null'),
  },
  {
    id: 'head-jsonld-primitive-string',
    src: 'janux',
    jsonLd: 'plain',
    expected: script(0, '"plain"'),
  },
  {
    id: 'head-jsonld-primitive-number',
    src: 'janux',
    jsonLd: 42,
    expected: script(0, '42'),
  },
  {
    /** The whole point: a `</script>` in the data cannot end the block early. */
    id: 'head-jsonld-cannot-break-out-of-the-script',
    src: 'janux',
    jsonLd: { name: '</script><img src=x onerror=alert(1)>' },
    expected: script(0, '{"name":"\\u003c/script>\\u003cimg src=x onerror=alert(1)>"}'),
  },
  {
    /** Every `<` is escaped, not just the ones that close something. */
    id: 'head-jsonld-every-less-than-is-escaped',
    src: 'janux',
    jsonLd: { note: 'a < b' },
    expected: script(0, '{"note":"a \\u003c b"}'),
  },
  {
    id: 'head-jsonld-escape-applies-to-every-entry',
    src: 'janux',
    jsonLd: [{ a: '<one' }, { b: '<two' }],
    expected: script(0, '{"a":"\\u003cone"}') + script(1, '{"b":"\\u003ctwo"}'),
  },
  {
    id: 'head-jsonld-nonce-on-every-block',
    src: 'janux',
    jsonLd: [{ a: 1 }, { b: 2 }],
    nonce: 'n0nce',
    expected: script(0, '{"a":1}', ' nonce="n0nce"') + script(1, '{"b":2}', ' nonce="n0nce"'),
  },
  {
    /** Quotes and non-ASCII are JSON's business, and JSON already handles them. */
    id: 'head-jsonld-quotes-and-unicode-survive',
    src: 'janux',
    jsonLd: { name: 'Café "✓"' },
    expected: script(0, '{"name":"Café \\"✓\\""}'),
  },
  {
    id: 'head-jsonld-nested-structures-survive',
    src: 'janux',
    jsonLd: { '@type': 'Recipe', ingredients: ['a', 'b'], author: { '@type': 'Person', name: 'A' } },
    expected: script(0, '{"@type":"Recipe","ingredients":["a","b"],"author":{"@type":"Person","name":"A"}}'),
  },
];
