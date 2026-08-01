import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { CHILD_ESCAPING_CASES } from './elements-children-escaping.cases';

describe('child text serialization', () => runTreeCases(CHILD_ESCAPING_CASES));
