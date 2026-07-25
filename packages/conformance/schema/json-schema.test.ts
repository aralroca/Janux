import { describe, expect } from 'bun:test';
import { toJsonSchema } from 'janux';
import { runCases } from '../support/scenario';
import { JSON_SCHEMA_CASES } from './json-schema.cases';

describe('json schema projection', () =>
  runCases(JSON_SCHEMA_CASES, (row) => {
    expect(toJsonSchema(row.type())).toEqual(row.expected);
  }));
