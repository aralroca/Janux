import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { SEMANTIC_COMPOSITE_CASES } from './elements-semantic-composites.cases';

describe('semantic element composites', () => runTreeCases(SEMANTIC_COMPOSITE_CASES));
