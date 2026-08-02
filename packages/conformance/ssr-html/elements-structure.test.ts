import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { STRUCTURE_CASES } from './elements-structure.cases';

describe('tree structure serialization', () => runTreeCases(STRUCTURE_CASES));
