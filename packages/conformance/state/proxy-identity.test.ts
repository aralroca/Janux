import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { PROXY_IDENTITY_CASES } from './proxy-identity.cases';

describe('proxy identity conformance', () => runScenarios(PROXY_IDENTITY_CASES));
