import { describe, expect } from 'bun:test';
import { selectMessages } from 'janux';
import { runCases } from '../support/scenario';
import { SELECT_MESSAGES_CASES } from './select-messages.cases';

describe('client message selection', () =>
  runCases(SELECT_MESSAGES_CASES, (row) => {
    expect(selectMessages(row.dic as never, row.used, row.declared, row.separator)).toEqual(row.expected as never);
  }));
