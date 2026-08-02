import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { URL_EDGE_CASES } from './attributes-url-edges.cases';

describe('executable url guard edges', () =>
  runCases(URL_EDGE_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
