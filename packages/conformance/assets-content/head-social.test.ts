import { describe, expect } from 'bun:test';
import { headTags } from '../../janux-server/src/head-tags';
import { runCases } from '../support/scenario';
import { HEAD_SOCIAL_CASES } from './head-social.cases';

describe('open graph and twitter cards', () =>
  runCases(HEAD_SOCIAL_CASES, (row) => {
    expect(headTags(row.meta, row.ctx)).toBe(row.expected);
  }));
