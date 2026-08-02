import { beforeEach, describe } from 'bun:test';
import { resetDocument, useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { MORPH_CONTROL_CASES } from './morph-controls.cases';

useDom();

describe('morph: control interactions across a patch', () => {
  beforeEach(resetDocument);
  runScenarios(MORPH_CONTROL_CASES);
});
