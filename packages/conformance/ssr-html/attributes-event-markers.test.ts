import { describe, expect } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { EVENT_MARKER_CASES } from './attributes-event-markers.cases';

describe('event marker serialization', () =>
  runCases(EVENT_MARKER_CASES, (row) => {
    expect(renderAttrs(row.props)).toBe(row.expected);
  }));
