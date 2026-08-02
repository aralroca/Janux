import { beforeEach, describe } from 'bun:test';
import { resetDocument, useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { MORPH_IDENTITY_CASES } from './morph-identity.cases';

useDom();

describe('morph: node identity across patches', () => {
  beforeEach(resetDocument);
  runScenarios(MORPH_IDENTITY_CASES);
});
