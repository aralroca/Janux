import type { Case } from '../support/case';

/**
 * The client-payload filter: which dictionary entries ship to the browser for
 * a page's islands.
 *
 * Used keys (recorded during SSR) match exactly, as a plural base
 * (`cart` pulls `cart_one`/`cart_other`/`cart_12`), or as a subtree parent —
 * but only across a separator boundary, so `nav` never drags `navigation`
 * along. Declared `i18nKeys` are different on purpose: a string is a raw
 * prefix (no separator guard) and a RegExp tests the flattened path.
 */
export interface SelectMessagesCase {
  dic: Record<string, unknown>;
  used: string[];
  declared?: (string | RegExp)[];
  separator?: string;
  expected: Record<string, unknown>;
}

export type SelectMessagesRow = Case<SelectMessagesCase>;

const DIC = {
  title: 'W',
  nav: { about: 'A', home: 'H' },
  navigation: 'sneaky',
  cart_one: '1',
  cart_other: 'n',
  cart_12: 'doz',
  toast: { saved: { ok: 'S' }, deleted: 'D' },
};

export const SELECT_MESSAGES_CASES: SelectMessagesRow[] = [
  // ── used keys (recorded during SSR) ─────────────────────────────────────────
  { id: 'i18n-select-a-used-base-pulls-every-plural-variant', src: 'janux', dic: DIC, used: ['cart'], expected: { cart_one: '1', cart_other: 'n', cart_12: 'doz' } },
  { id: 'i18n-select-a-used-suffixed-path-ships-only-itself', src: 'janux', dic: DIC, used: ['cart_one'], expected: { cart_one: '1' } },
  { id: 'i18n-select-a-used-parent-pulls-its-subtree', src: 'janux', dic: DIC, used: ['nav'], expected: { nav: { about: 'A', home: 'H' } } },
  { id: 'i18n-select-a-used-key-never-matches-a-partial-segment', src: 'janux', dic: { nav: { about: 'A' }, navigation: 'sneaky' }, used: ['navi'], expected: {} },
  { id: 'i18n-select-a-deep-leaf-keeps-its-nesting', src: 'janux', dic: DIC, used: ['toast.saved.ok'], expected: { toast: { saved: { ok: 'S' } } } },
  { id: 'i18n-select-plural-variants-of-a-nested-key', src: 'janux', dic: { nav: { item_one: 'i', item_other: 'is', other: 'o' } }, used: ['nav.item'], expected: { nav: { item_one: 'i', item_other: 'is' } } },
  { id: 'i18n-select-nothing-used-ships-nothing', src: 'janux', dic: DIC, used: [], expected: {} },
  { id: 'i18n-select-a-custom-separator-bounds-the-subtree', src: 'janux', dic: { a: { b: 'x', c: 'y' } }, used: ['a:b'], separator: ':', expected: { a: { b: 'x' } } },

  // ── declared i18nKeys (islands' static declarations) ────────────────────────
  { id: 'i18n-select-a-declared-string-is-a-raw-prefix', src: 'janux', dic: DIC, used: [], declared: ['nav'], expected: { nav: { about: 'A', home: 'H' }, navigation: 'sneaky' } },
  { id: 'i18n-select-a-declared-prefix-may-cut-a-segment', src: 'janux', dic: DIC, used: [], declared: ['toast.sa'], expected: { toast: { saved: { ok: 'S' } } } },
  { id: 'i18n-select-a-declared-regexp-tests-the-flat-path', src: 'janux', dic: DIC, used: [], declared: [/_12$/], expected: { cart_12: 'doz' } },
  { id: 'i18n-select-a-declared-regexp-may-span-subtrees', src: 'janux', dic: DIC, used: [], declared: [/saved|deleted/], expected: { toast: { saved: { ok: 'S' }, deleted: 'D' } } },
];
