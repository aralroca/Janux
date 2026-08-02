import { describe, expect } from 'bun:test';
import { localeDir, splitLocale } from '../../janux-server/src/i18n-routing';
import { runCases } from '../support/scenario';
import { LOCALE_DIR_CASES, SPLIT_LOCALE_CASES } from './locale-paths.cases';

describe('locale path splitting', () =>
  runCases(SPLIT_LOCALE_CASES, (row) => {
    expect(splitLocale(row.pathname, row.locales)).toEqual(row.expected);
  }));

describe('locale text direction', () =>
  runCases(LOCALE_DIR_CASES, (row) => {
    expect(localeDir(row.locale)).toBe(row.dir);
  }));
