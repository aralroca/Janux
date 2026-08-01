import { describe, expect } from 'bun:test';
import { imageWidths } from '../../janux/src/image/urls';
import { runCases } from '../support/scenario';
import { IMAGE_WIDTHS_CASES } from './image-widths.cases';

describe('srcset candidate ladder', () =>
  runCases(IMAGE_WIDTHS_CASES, (row) => {
    expect(imageWidths(row.width)).toEqual(row.expected);
  }));
