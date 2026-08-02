import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { WITH_BINDING_CASES } from './with-binding.cases';

describe('.with() binding conformance', () => runScenarios(WITH_BINDING_CASES));
