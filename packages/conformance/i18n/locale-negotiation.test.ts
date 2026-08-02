import { describe, expect } from 'bun:test';
import { detectLocale } from '../../janux-server/src/i18n-routing';
import { runCases } from '../support/scenario';
import { NEGOTIATION_CASES } from './locale-negotiation.cases';

describe('locale negotiation', () =>
  runCases(NEGOTIATION_CASES, (row) => {
    const headers: Record<string, string> = {};

    if (row.header !== undefined) headers['accept-language'] = row.header;
    if (row.cookie !== undefined) headers.cookie = row.cookie;
    const request = new Request('http://test/', { headers });

    expect(detectLocale(request, { locales: row.locales, defaultLocale: row.defaultLocale })).toBe(row.expected);
  }));
