import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { detectLocale, localeDir, splitLocale } from '../../janux-server/src/i18n-routing';
import { runCases } from '../support/scenario';
import { DETECT_CASES, DIR_CASES, LOCALE_MATCH_CASES, SPLIT_CASES } from './locale-routing.cases';

describe('locale prefix splitting', () =>
  runCases(SPLIT_CASES, (row) => {
    const { locale, pathname } = splitLocale(row.path, row.locales);

    expect(locale ?? null).toBe(row.locale);
    expect(pathname).toBe(row.rest);
  }));

describe('locale detection', () =>
  runCases(DETECT_CASES, (row) => {
    const headers = new Headers();

    if (row.cookie !== null) headers.set('cookie', row.cookie);
    if (row.accept !== null) headers.set('accept-language', row.accept);
    const request = new Request('http://conformance.test/', { headers });

    expect(detectLocale(request, { locales: row.locales, defaultLocale: row.defaultLocale })).toBe(row.locale);
  }));

describe('text direction', () =>
  runCases(DIR_CASES, (row) => {
    expect(localeDir(row.locale)).toBe(row.dir);
  }));

const router = createFsRouter(join(dirname(import.meta.path), '__fixtures__/routes'));

describe('locale prefix composed with route matching', () =>
  runCases(LOCALE_MATCH_CASES, (row) => {
    const { locale, pathname } = splitLocale(row.path, ['en', 'es']);
    const match = router.match(pathname);

    expect(locale ?? null).toBe(row.locale);
    expect(match?.pattern ?? null).toBe(row.pattern);
    if (row.pattern !== null) expect(match!.params).toEqual(row.params ?? {});
  }));
