import type { Case } from '../support/case';

/**
 * Plural category selection per locale.
 *
 * The expected column is CLDR's published rule set, not a recording of what Janux
 * currently returns — so if the implementation ever stops delegating to
 * `Intl.PluralRules` and grows a hand-rolled rule table, every row that diverges
 * from CLDR fails. English has two categories and hides every bug that Arabic
 * (six), Welsh (six) and the Slavic families (four, with different boundaries)
 * expose.
 */
export interface PluralCase {
  locale: string;
  count: number;
  /** The CLDR category, i.e. which `items_<category>` message must be chosen. */
  category: string;
}

export type PluralRow = Case<PluralCase>;

/** `[locale, [[count, category], …]]` — CLDR plural rules, cardinal. */
const CLDR: [string, [number, string][]][] = [
  // one for exactly 1, other for everything else — including 0.
  ['en', [[0, 'other'], [1, 'one'], [2, 'other'], [3, 'other'], [11, 'other'], [21, 'other'], [100, 'other'], [1000000, 'other']]],
  ['es', [[0, 'other'], [1, 'one'], [2, 'other'], [21, 'other'], [100, 'other']]],
  ['de', [[0, 'other'], [1, 'one'], [2, 'other'], [100, 'other']]],
  ['it', [[0, 'other'], [1, 'one'], [2, 'other'], [100, 'other']]],
  ['nl', [[0, 'other'], [1, 'one'], [2, 'other']]],
  // French counts 0 as singular.
  ['fr', [[0, 'one'], [1, 'one'], [2, 'other'], [21, 'other'], [100, 'other']]],
  ['pt', [[0, 'one'], [1, 'one'], [2, 'other']]],
  // Arabic uses all six categories.
  ['ar', [[0, 'zero'], [1, 'one'], [2, 'two'], [3, 'few'], [5, 'few'], [10, 'few'], [11, 'many'], [21, 'many'], [99, 'many'], [100, 'other'], [101, 'other']]],
  // Welsh also uses all six, with different boundaries than Arabic.
  ['cy', [[0, 'zero'], [1, 'one'], [2, 'two'], [3, 'few'], [5, 'other'], [6, 'many'], [7, 'other'], [100, 'other']]],
  // Polish: few for 2-4 except the teens.
  ['pl', [[0, 'many'], [1, 'one'], [2, 'few'], [3, 'few'], [4, 'few'], [5, 'many'], [12, 'many'], [14, 'many'], [22, 'few'], [25, 'many'], [100, 'many']]],
  // Russian: one for n%10==1 except 11, so 21 is singular and 11 is not.
  ['ru', [[0, 'many'], [1, 'one'], [2, 'few'], [4, 'few'], [5, 'many'], [11, 'many'], [12, 'many'], [21, 'one'], [22, 'few'], [25, 'many'], [100, 'many'], [101, 'one']]],
  ['uk', [[1, 'one'], [2, 'few'], [5, 'many'], [11, 'many'], [21, 'one']]],
  // Czech has a separate category for fractions, and few for 2-4.
  ['cs', [[0, 'other'], [1, 'one'], [2, 'few'], [4, 'few'], [5, 'other'], [100, 'other']]],
  // Lithuanian: few for 2-9 except the teens.
  ['lt', [[0, 'other'], [1, 'one'], [2, 'few'], [9, 'few'], [10, 'other'], [11, 'other'], [21, 'one'], [22, 'few']]],
  // Irish uses two/few/many.
  ['ga', [[1, 'one'], [2, 'two'], [3, 'few'], [6, 'few'], [7, 'many'], [10, 'many'], [11, 'other']]],
  // Maltese.
  ['mt', [[1, 'one'], [2, 'two'], [11, 'many'], [20, 'other']]],
  // Hebrew.
  ['he', [[1, 'one'], [2, 'two'], [20, 'other']]],
  // No plural distinction at all.
  ['ja', [[0, 'other'], [1, 'other'], [2, 'other'], [100, 'other']]],
  ['zh', [[0, 'other'], [1, 'other'], [2, 'other']]],
  ['ko', [[0, 'other'], [1, 'other'], [2, 'other']]],
  ['th', [[0, 'other'], [1, 'other'], [2, 'other']]],
  ['vi', [[0, 'other'], [1, 'other'], [2, 'other']]],
  ['id', [[0, 'other'], [1, 'other'], [2, 'other']]],
  ['tr', [[0, 'other'], [1, 'one'], [2, 'other']]],
  ['hi', [[0, 'one'], [1, 'one'], [2, 'other']]],
];

export const PLURAL_CASES: PluralRow[] = CLDR.flatMap(([locale, counts]) =>
  counts.map(([count, category]) => ({
    id: `plural-${locale}-${count}-is-${category}`,
    src: 'cldr:plural-rules#cardinal',
    locale,
    count,
    category,
  })),
);
