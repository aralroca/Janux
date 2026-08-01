import type { Case } from '../support/case';
import type { PluralCase } from './plurals.cases';

/**
 * Plural category selection beyond the base corpus: the locales whose rule
 * systems have no English analogue, plus the count shapes integers hide.
 *
 * Same contract as `plurals.cases.ts`: the expected column is CLDR's published
 * cardinal rule set, so a hand-rolled rule table that diverges from
 * `Intl.PluralRules` fails here. The families this file adds are the ones a
 * "zero/one/two/few/many/other is enough per count" implementation gets wrong:
 * Romanian's giant `few` (0, 2-19 and every x01-x19), Slovenian's dual by
 * n%100, Latvian's `zero` for teens and x0, Breton's `many` at the millions,
 * Filipino's last-digit exclusion rule — and the non-integer counts (CLDR
 * evaluates fractions with different operands, so cs 1.5 is `many` while
 * fr 1.5 is `one`), negative counts (rules apply to |n|), the CLDR-42 Romance
 * `many` for 10^6, and Infinity.
 */
export type PluralLocaleRow = Case<PluralCase>;

/** `[locale, [[count, category], …]]` — CLDR plural rules, cardinal. */
const CLDR: [string, [number, string][]][] = [
  // Romanian: few covers 0, 2-19 and n%100 in 1..19 — so 101 is few but 120 is not.
  ['ro', [[0, 'few'], [1, 'one'], [2, 'few'], [19, 'few'], [20, 'other'], [21, 'other'], [101, 'few'], [119, 'few'], [120, 'other'], [1.5, 'few']]],
  // Croatian: Slavic one/few by last digit, but no many bucket — 5 and 11 are plain other.
  ['hr', [[1, 'one'], [2, 'few'], [4, 'few'], [5, 'other'], [11, 'other'], [12, 'other'], [21, 'one'], [22, 'few'], [25, 'other'], [100, 'other'], [1.1, 'one']]],
  ['sr', [[1, 'one'], [2, 'few'], [5, 'other'], [11, 'other'], [21, 'one'], [22, 'few'], [101, 'one']]],
  // Slovenian keeps a true dual: n%100==2 is two, so 102 and 202 are dual again.
  ['sl', [[1, 'one'], [2, 'two'], [3, 'few'], [4, 'few'], [5, 'other'], [100, 'other'], [101, 'one'], [102, 'two'], [103, 'few'], [105, 'other'], [202, 'two'], [1.5, 'few']]],
  // Slovak mirrors Czech for integers, and sends every fraction to many.
  ['sk', [[0, 'other'], [1, 'one'], [2, 'few'], [4, 'few'], [5, 'other'], [10, 'other'], [100, 'other'], [1.5, 'many']]],
  // Belarusian: Russian-style boundaries — x1 is one (except 11), x2-x4 few, the rest many.
  ['be', [[1, 'one'], [2, 'few'], [5, 'many'], [11, 'many'], [21, 'one'], [22, 'few'], [25, 'many'], [101, 'one']]],
  // Latvian: a zero category for 0, the teens and every x0 — and 2 is already other.
  ['lv', [[0, 'zero'], [1, 'one'], [2, 'other'], [10, 'zero'], [11, 'zero'], [20, 'zero'], [21, 'one'], [101, 'one'], [111, 'zero'], [0.5, 'other']]],
  // Icelandic: one for n%10==1 except n%100==11 — like Russian's one, without few/many.
  ['is', [[1, 'one'], [2, 'other'], [11, 'other'], [21, 'one'], [101, 'one'], [1.5, 'other']]],
  // Breton: few only at x3/x4/x9 (excluding teens and x70/x90), many at whole millions.
  ['br', [[1, 'one'], [2, 'two'], [3, 'few'], [4, 'few'], [5, 'other'], [9, 'few'], [21, 'one'], [22, 'two'], [23, 'few'], [24, 'few'], [29, 'few'], [71, 'other'], [91, 'other'], [1000000, 'many'], [1.5, 'other']]],
  // Scottish Gaelic: one is {1,11}, two is {2,12}, few is 3-10 and 13-19.
  ['gd', [[1, 'one'], [2, 'two'], [3, 'few'], [10, 'few'], [11, 'one'], [12, 'two'], [13, 'few'], [19, 'few'], [20, 'other'], [40, 'other']]],
  // Lower Sorbian: dual and few by n%100, so the pattern repeats at 101-103.
  ['dsb', [[1, 'one'], [2, 'two'], [3, 'few'], [4, 'few'], [5, 'other'], [101, 'one'], [102, 'two'], [103, 'few']]],
  // Filipino: one unless the last digit is 4, 6 or 9 — so 10 is singular and 14 is not.
  ['fil', [[1, 'one'], [2, 'one'], [3, 'one'], [4, 'other'], [6, 'other'], [9, 'other'], [10, 'one'], [14, 'other'], [16, 'other'], [19, 'other']]],
  // Colognian: one of the few languages with zero for exactly 0.
  ['ksh', [[0, 'zero'], [1, 'one'], [2, 'other']]],
  // Danish counts 1.5 as singular (t≠0 with i in 0..1), unlike English.
  ['da', [[0, 'other'], [1, 'one'], [2, 'other'], [1.5, 'one']]],
  ['sv', [[0, 'other'], [1, 'one'], [2, 'other']]],
  ['fi', [[0, 'other'], [1, 'one'], [2, 'other']]],
  ['hu', [[0, 'other'], [1, 'one'], [2, 'other']]],
  ['el', [[0, 'other'], [1, 'one'], [2, 'other']]],
  // Catalan grew a many category for 10^6 in CLDR 42.
  ['ca', [[1, 'one'], [2, 'other'], [1000000, 'many']]],
  // The i=0-or-n=1 family: 0 and every fraction below 1 are singular.
  ['fa', [[0, 'one'], [1, 'one'], [2, 'other'], [0.5, 'one']]],
  ['am', [[0, 'one'], [1, 'one'], [2, 'other']]],
  ['bn', [[0, 'one'], [1, 'one'], [2, 'other']]],
  ['pa', [[0, 'one'], [1, 'one'], [2, 'other']]],
  ['si', [[0, 'one'], [1, 'one'], [2, 'other'], [0.1, 'one']]],
  // Strict n=1 singular: 0 is plural, unlike fr/pt/hi.
  ['ta', [[1, 'one'], [2, 'other']]],
  ['ur', [[1, 'one'], [2, 'other']]],
  ['sw', [[1, 'one'], [2, 'other']]],
  ['az', [[1, 'one'], [2, 'other']]],
  ['ka', [[1, 'one'], [2, 'other']]],
  // No plural distinction at all.
  ['km', [[1, 'other'], [2, 'other']]],
  ['lo', [[1, 'other'], [2, 'other']]],
  ['ms', [[1, 'other'], [2, 'other']]],
  ['yo', [[1, 'other'], [2, 'other']]],
  ['my', [[0, 'other'], [1, 'other'], [2, 'other']]],
  // Fractions in the base-corpus locales: v≠0 changes the operands, so the
  // category is not "whatever 1 or 2 got" — cs sends fractions to many,
  // fr/pt keep them singular, the Slavic many-languages send them to other.
  ['en', [[1.5, 'other']]],
  ['es', [[1.5, 'other']]],
  ['fr', [[1.5, 'one'], [2.5, 'other']]],
  ['pt', [[0.5, 'one'], [1.5, 'one']]],
  ['ru', [[1.5, 'other']]],
  ['pl', [[1.5, 'other']]],
  ['cs', [[1.5, 'many']]],
  ['uk', [[1.5, 'other']]],
  ['ar', [[1.5, 'other']]],
  ['he', [[1.5, 'other']]],
  ['ja', [[1.5, 'other']]],
  // CLDR 42 gave the Romance languages many at 10^6 ("un millón de libros").
  ['fr', [[1000000, 'many']]],
  ['es', [[1000000, 'many']]],
  ['it', [[1000000, 'many']]],
  ['pt', [[1000000, 'many']]],
  // Rules apply to |n|: -1 is singular in English, -21 is singular in Russian.
  ['en', [[-1, 'one'], [-2, 'other']]],
  ['ar', [[-3, 'few']]],
  ['ru', [[-21, 'one']]],
  // Non-finite counts still select a category instead of throwing.
  ['en', [[Infinity, 'other']]],
];

/** `-` and `.` are not kebab-case, so counts like -21 and 1.5 need a readable slug. */
function countSlug(count: number): string {
  if (!Number.isFinite(count)) return 'infinity';
  const sign = count < 0 ? 'minus-' : '';

  return sign + String(Math.abs(count)).replace('.', '-');
}

export const PLURAL_LOCALE_CASES: PluralLocaleRow[] = CLDR.flatMap(([locale, counts]) =>
  counts.map(([count, category]) => ({
    id: `i18n-plural-${locale}-${countSlug(count)}-is-${category}`,
    src: 'cldr:plural-rules#cardinal',
    locale,
    count,
    category,
  })),
);
