import { describe, expect } from 'bun:test';
import { fontPreloadHrefs } from '../../janux/src/font/css';
import { runCases } from '../support/scenario';
import { FONT_PRELOAD_CASES } from './font-preload.cases';

describe('font preload hrefs', () =>
  runCases(FONT_PRELOAD_CASES, (row) => {
    expect(fontPreloadHrefs(row.fonts)).toEqual(row.expected);
  }));
