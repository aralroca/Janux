import { describe } from 'bun:test';
import { useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { ORIGIN_AUDIT_CASES } from './origin-audit.cases';

useDom();

describe('origin attribution and audit conformance', () => runScenarios(ORIGIN_AUDIT_CASES));
