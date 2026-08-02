import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { RAW_TEXT_CASES } from './elements-raw-text.cases';

describe('raw text element serialization', () => runTreeCases(RAW_TEXT_CASES));
