import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { URL_INTEGRATION_CASES } from './elements-url-integration.cases';

describe('url guard at the element level', () => runTreeCases(URL_INTEGRATION_CASES));
