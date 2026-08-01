import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { VALUES_IDENTITY_CASES } from './values-identity.cases';

describe('values-identity conformance', () => runScenarios(VALUES_IDENTITY_CASES));
