import { describe, expect } from 'bun:test';
import { Image } from '../../janux/src/image/image';
import { runCases } from '../support/scenario';
import { IMAGE_ERROR_CASES } from './image-errors.cases';

describe('<Image> author errors', () =>
  runCases(IMAGE_ERROR_CASES, (row) => {
    expect(() => Image(row.props)).toThrow(row.expected);
  }));
