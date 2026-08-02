import type { Case } from '../support/case';

/**
 * The interpolation surface of `translateCore`: custom affixes, the
 * `{{variable, format}}` formatter hook, and the placeholder-name charset.
 *
 * The affix pair is compiled into the placeholder regex, so every row with a
 * regex metacharacter in `prefix`/`suffix` is really asserting that the affix
 * was escaped — `((`/`))` or `${`/`}` used to be a crash or a mis-match in the
 * next-translate lineage. The name charset `[\w$.-]` decides what is a
 * placeholder at all: dots and dashes are in (dotted query keys are data),
 * anything else means the braces stay in the output verbatim.
 */
export interface InterpolationCase {
  messages: Record<string, unknown>;
  key: string;
  query?: Record<string, unknown> | null;
  options?: Record<string, unknown>;
  /** Passed through as `config.interpolation`. */
  interpolation?: {
    prefix?: string;
    suffix?: string;
    format?: (value: unknown, format: string, locale: string) => string;
  };
  expected: unknown;
}

export type InterpolationRow = Case<InterpolationCase>;

const UPPER = (value: unknown) => String(value).toUpperCase();

export const INTERPOLATION_CASES: InterpolationRow[] = [
  // ── custom affixes are escaped, never compiled as regex ─────────────────────
  { id: 'i18n-interp-dollar-brace-affixes', src: 'janux', messages: { k: 'v=${n}' }, key: 'k', query: { n: 1 }, interpolation: { prefix: '${', suffix: '}' }, expected: 'v=1' },
  { id: 'i18n-interp-paren-affixes', src: 'janux', messages: { k: '((n))' }, key: 'k', query: { n: 2 }, interpolation: { prefix: '((', suffix: '))' }, expected: '2' },
  { id: 'i18n-interp-single-brace-affixes', src: 'janux', messages: { k: '{n}' }, key: 'k', query: { n: 3 }, interpolation: { prefix: '{', suffix: '}' }, expected: '3' },
  { id: 'i18n-interp-identical-prefix-and-suffix', src: 'janux', messages: { k: 'a ||n|| b' }, key: 'k', query: { n: 1 }, interpolation: { prefix: '||', suffix: '||' }, expected: 'a 1 b' },
  // next-translate's documented sprintf-style config: no suffix, the name ends itself.
  { id: 'i18n-interp-empty-suffix-reads-to-name-end', src: 'next-translate:i18n#interpolation', messages: { k: 'hello %name' }, key: 'k', query: { name: 'x' }, interpolation: { prefix: '%', suffix: '' }, expected: 'hello x' },
  // …but the name charset includes '.', so trailing punctuation joins the name and misses the query.
  { id: 'i18n-interp-empty-suffix-swallows-trailing-dot', src: 'janux', messages: { k: 'hi %name.' }, key: 'k', query: { name: 'x' }, interpolation: { prefix: '%', suffix: '' }, expected: 'hi %name.' },

  // ── the format hook ─────────────────────────────────────────────────────────
  { id: 'i18n-interp-format-receives-name-and-locale', src: 'janux', messages: { k: '{{n, upper}}' }, key: 'k', query: { n: 'x' }, interpolation: { format: (value, name, locale) => `${name}:${locale}:${value}` }, expected: 'upper:en:x' },
  { id: 'i18n-interp-format-receives-the-raw-value', src: 'janux', messages: { k: '{{n, t}}' }, key: 'k', query: { n: 5 }, interpolation: { format: (value) => typeof value }, expected: 'number' },
  { id: 'i18n-interp-format-name-without-a-format-fn-is-plain-substitution', src: 'janux', messages: { k: '{{n, upper}}' }, key: 'k', query: { n: 'a' }, expected: 'a' },
  { id: 'i18n-interp-format-only-applies-to-named-occurrences', src: 'janux', messages: { k: '{{n}} {{n, up}}' }, key: 'k', query: { n: 'x' }, interpolation: { format: UPPER }, expected: 'x X' },
  { id: 'i18n-interp-format-applies-inside-returned-objects', src: 'janux', messages: { o: { v: '{{n, up}}' } }, key: 'o', query: { n: 'x' }, options: { returnObjects: true }, interpolation: { format: UPPER }, expected: { v: 'X' } },
  { id: 'i18n-interp-space-before-the-name-reads-as-a-format', src: 'janux', messages: { k: '{{a b}}' }, key: 'k', query: { a: 1 }, expected: '1' },
  { id: 'i18n-interp-comma-after-whitespace-still-names-a-format', src: 'janux', messages: { k: '{{n ,up}}' }, key: 'k', query: { n: 1 }, interpolation: { format: (_value, name) => name }, expected: 'up' },

  // ── the placeholder-name charset ────────────────────────────────────────────
  { id: 'i18n-interp-dotted-name-is-a-single-key', src: 'janux', messages: { k: '{{user.name}}' }, key: 'k', query: { 'user.name': 'Ada' }, expected: 'Ada' },
  { id: 'i18n-interp-dashed-name', src: 'janux', messages: { k: '{{first-name}}' }, key: 'k', query: { 'first-name': 'A' }, expected: 'A' },
  { id: 'i18n-interp-dollar-name', src: 'janux', messages: { k: '{{$v}}' }, key: 'k', query: { $v: 9 }, expected: '9' },
  { id: 'i18n-interp-digits-in-a-name', src: 'janux', messages: { k: '{{n1}}' }, key: 'k', query: { n1: 7 }, expected: '7' },
  { id: 'i18n-interp-leading-underscore-name', src: 'janux', messages: { k: '{{_n}}' }, key: 'k', query: { _n: 3 }, expected: '3' },
  { id: 'i18n-interp-non-ascii-name-is-not-a-placeholder', src: 'janux', messages: { k: '{{ñ}}' }, key: 'k', query: { ñ: 1 }, expected: '{{ñ}}' },
  { id: 'i18n-interp-empty-braces-are-not-a-placeholder', src: 'janux', messages: { k: 'x {{}} y' }, key: 'k', query: { n: 1 }, expected: 'x {{}} y' },
  { id: 'i18n-interp-newlines-inside-the-braces-are-whitespace', src: 'janux', messages: { k: '{{\nn\n}}' }, key: 'k', query: { n: 'v' }, expected: 'v' },

  // ── substitution semantics ──────────────────────────────────────────────────
  { id: 'i18n-interp-supplied-and-missing-side-by-side', src: 'janux', messages: { k: '{{a}}{{b}}' }, key: 'k', query: { a: 1 }, expected: '1{{b}}' },
  { id: 'i18n-interp-empty-string-value-substitutes-to-nothing', src: 'janux', messages: { k: '[{{n}}]' }, key: 'k', query: { n: '' }, expected: '[]' },
  // The core does not HTML-escape values; escaping is the renderer's job at the sink.
  { id: 'i18n-interp-values-are-not-html-escaped-by-the-core', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: '<b>&"' }, expected: '<b>&"' },
];
