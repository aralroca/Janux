import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { LLMS_TXT_CASES } from './llms-txt.cases';

describe('llms.txt index', () => runScenarios(LLMS_TXT_CASES));
