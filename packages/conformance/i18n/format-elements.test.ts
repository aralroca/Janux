import { describe, expect } from 'bun:test';
import { formatElements } from 'janux';
import { runCases } from '../support/scenario';
import { FORMAT_ELEMENTS_CASES } from './format-elements.cases';

describe('format elements', () =>
  runCases(FORMAT_ELEMENTS_CASES, (row) => {
    expect(formatElements(row.value, row.elements as never)).toEqual(row.expected as never);
  }));
