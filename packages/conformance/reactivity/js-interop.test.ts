import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { JS_INTEROP_CASES } from './js-interop.cases';

describe('js-interop conformance', () => runScenarios(JS_INTEROP_CASES));
