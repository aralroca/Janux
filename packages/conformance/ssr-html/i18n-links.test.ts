import { describe, expect } from 'bun:test';
import { renderToString } from 'janux';
import { runCases } from '../support/scenario';
import { LOCALIZED_LINK_CASES } from './i18n-links.cases';

describe('i18n link localization', () =>
  runCases(LOCALIZED_LINK_CASES, async (row) => {
    const ctx = { i18n: { locale: row.locale, locales: row.locales } } as never;
    const { html } = await renderToString(row.node(), { ctx });

    expect(html).toBe(row.expected);
  }));
