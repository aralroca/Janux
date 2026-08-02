import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { VOID_TAG_CASES } from './elements-void-tags.cases';

describe('void element boundary', () => runTreeCases(VOID_TAG_CASES));
