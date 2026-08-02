import { describe } from 'bun:test';
import { useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { CONTROLS_IME_CASES } from './controls-ime.cases';

useDom();

describe('controlled inputs and IME conformance', () => runScenarios(CONTROLS_IME_CASES));
