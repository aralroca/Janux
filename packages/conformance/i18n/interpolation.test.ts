import { describe, expect } from 'bun:test';
import { translateCore } from 'janux';
import { runCases } from '../support/scenario';
import { INTERPOLATION_CASES } from './interpolation.cases';

type LooseTranslate = (key: string, query?: unknown, options?: unknown) => unknown;

describe('interpolation config', () =>
  runCases(INTERPOLATION_CASES, (row) => {
    const t = translateCore('en', {
      locales: ['en'],
      defaultLocale: 'en',
      messages: { en: row.messages },
      ...(row.interpolation ? { interpolation: row.interpolation } : {}),
    } as never) as unknown as LooseTranslate;

    expect(t(row.key, row.query, row.options)).toEqual(row.expected);
  }));
