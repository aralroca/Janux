import { describe, expect } from 'bun:test';
import { translateCore } from 'janux';
import { runCases } from '../support/scenario';
import { RESOLUTION_CASES } from './resolution.cases';

type LooseTranslate = (key: string, query?: unknown, options?: unknown) => unknown;

describe('key resolution', () =>
  runCases(RESOLUTION_CASES, (row) => {
    const locale = row.locale ?? 'en';
    const t = translateCore(locale, {
      locales: [locale],
      defaultLocale: locale,
      messages: { [locale]: row.messages },
      ...(row.keySeparator !== undefined ? { keySeparator: row.keySeparator } : {}),
      ...(row.allowEmptyStrings !== undefined ? { allowEmptyStrings: row.allowEmptyStrings } : {}),
    } as never) as unknown as LooseTranslate;

    expect(t(row.key, row.query, row.options)).toEqual(row.expected);
  }));
