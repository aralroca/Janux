import { describe, expect } from 'bun:test';
import { translateCore } from 'janux';
import { runCases } from '../support/scenario';
import { PLURAL_CASES } from './plurals.cases';

type LooseTranslate = (key: string, query?: unknown, options?: unknown) => unknown;

/** One message per category, so the returned text names the category that won. */
const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const MESSAGES = Object.fromEntries(CATEGORIES.map((name) => [`items_${name}`, name]));

describe('plural selection', () =>
  runCases(PLURAL_CASES, (row) => {
    const t = translateCore(row.locale, {
      locales: [row.locale],
      defaultLocale: row.locale,
      messages: { [row.locale]: MESSAGES },
    } as never) as unknown as LooseTranslate;

    expect(t('items', { count: row.count })).toBe(row.category);
  }));
