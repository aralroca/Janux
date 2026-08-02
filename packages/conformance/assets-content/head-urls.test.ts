import { describe, expect } from 'bun:test';
import { absoluteUrl } from '../../janux-server/src/head-tags';
import { runCases } from '../support/scenario';
import { HEAD_URL_CASES } from './head-urls.cases';

describe('social url resolution', () =>
  runCases(HEAD_URL_CASES, (row) => {
    expect(absoluteUrl(row.value, row.siteUrl)).toBe(row.expected!);
  }));
