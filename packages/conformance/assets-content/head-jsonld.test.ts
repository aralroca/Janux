import { describe, expect } from 'bun:test';
import { headTags } from '../../janux-server/src/head-tags';
import { runCases } from '../support/scenario';
import { JSONLD_CASES } from './head-jsonld.cases';

const CARDS = '<meta property="og:type" id="jx-og-type" content="website"><meta name="twitter:card" id="jx-twitter-card" content="summary">';

describe('json-ld blocks', () =>
  runCases(JSONLD_CASES, (row) => {
    expect(headTags({ jsonLd: row.jsonLd }, { nonce: row.nonce })).toBe(CARDS + row.expected);
  }));
