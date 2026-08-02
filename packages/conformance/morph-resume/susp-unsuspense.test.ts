import { beforeEach, describe } from 'bun:test';
import { resetDocument, useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { SUSP_CASES } from './susp-unsuspense.cases';

useDom();

describe('suspense: jx$u slot filling', () => {
  beforeEach(() => {
    resetDocument();
    (self as any).jx$p = undefined;
  });
  runScenarios(SUSP_CASES);
});
