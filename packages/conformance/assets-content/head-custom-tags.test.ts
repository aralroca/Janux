import { describe, expect } from 'bun:test';
import { headTags } from '../../janux-server/src/head-tags';
import { runCases } from '../support/scenario';
import { HEAD_CUSTOM_CASES } from './head-custom-tags.cases';

/** The cards a bare `meta` always emits, so a row only states its own tags. */
const CARDS = '<meta property="og:type" id="jx-og-type" content="website"><meta name="twitter:card" id="jx-twitter-card" content="summary">';

describe('head escape hatch', () =>
  runCases(HEAD_CUSTOM_CASES, (row) => {
    expect(headTags({ head: row.tags }, { nonce: row.nonce })).toBe(CARDS + row.expected);
  }));
