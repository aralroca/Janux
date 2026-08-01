import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { TABLE_FORM_CASES } from './elements-tables-forms.cases';

describe('table and form element serialization', () => runTreeCases(TABLE_FORM_CASES));
