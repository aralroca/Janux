import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { ELEMENT_CASES } from './elements.cases';

describe('element serialization', () => runTreeCases(ELEMENT_CASES));
