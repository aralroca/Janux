import { describe, expect } from 'bun:test';
import { isOptimizable, isRemote } from '../../janux/src/image/urls';
import { runCases } from '../support/scenario';
import { SOURCE_CLASSIFY_CASES } from './image-source-classify.cases';

describe('source classification', () =>
  runCases(SOURCE_CLASSIFY_CASES, (row) => {
    expect({ optimizable: isOptimizable(row.path), remote: isRemote(row.path) }).toEqual({
      optimizable: row.optimizable,
      remote: row.remote,
    });
  }));
