import { describe } from 'bun:test';
import { useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { DELEGATION_CASES } from './delegation.cases';

useDom();

describe('event delegation conformance', () => runScenarios(DELEGATION_CASES));
