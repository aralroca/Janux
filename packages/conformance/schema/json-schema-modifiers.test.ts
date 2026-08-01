import { describe, expect } from 'bun:test';
import { toJsonSchema } from 'janux';
import { runCases } from '../support/scenario';
import { JSON_SCHEMA_MODIFIER_CASES } from './json-schema-modifiers.cases';

describe('json schema projection: modifier combinations', () =>
  runCases(JSON_SCHEMA_MODIFIER_CASES, (row) => {
    expect(toJsonSchema(row.type())).toEqual(row.expected);
  }));
