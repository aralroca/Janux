import { describe, expect } from 'bun:test';
import { translateCore } from 'janux';
import { runCases } from '../support/scenario';
import { TRANSLATE_CASES } from './translate.cases';

type LooseTranslate = (key: string, query?: unknown, options?: unknown) => unknown;

describe('translate', () =>
  runCases(TRANSLATE_CASES, (row) => {
    const locale = row.locale ?? 'en';
    const t = translateCore(locale, {
      locales: [locale],
      defaultLocale: 'en',
      messages: { en: row.messages },
    } as never) as unknown as LooseTranslate;

    expect(t(row.key, row.query, row.options)).toEqual(row.expected);
  }));
