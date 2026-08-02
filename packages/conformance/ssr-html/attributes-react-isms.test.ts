import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { REACT_ISM_CASES } from './attributes-react-isms.cases';

describe('react-renamed props serialize verbatim', () =>
  runCases(REACT_ISM_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
