import { beforeEach, describe } from 'bun:test';
import { resetDocument, useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { BRIDGE_CALL_CASES } from './bridge-call.cases';

useDom();

describe('bridge tool addressing', () => {
  beforeEach(resetDocument);
  runScenarios(BRIDGE_CALL_CASES);
});
