import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { ERROR_PROPAGATION_CASES } from './errors-propagation.cases';

describe('errors-propagation conformance', () => runScenarios(ERROR_PROPAGATION_CASES));
