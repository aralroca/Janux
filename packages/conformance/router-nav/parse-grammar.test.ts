import { createFsRouter } from '@janux/server';
import { describe, expect } from 'bun:test';
import { dirname, join } from 'node:path';
import { runCases } from '../support/scenario';
import { GRAMMAR_CASES, type GrammarCase } from './parse-grammar.cases';

const fixture = (name: GrammarCase['fixture']) =>
  createFsRouter(join(dirname(import.meta.path), '__fixtures__', name));

const routers = {
  routes: fixture('routes'),
  precedence: fixture('precedence'),
  decoding: fixture('decoding'),
  rest: fixture('rest'),
  matchers: fixture('matchers'),
  conventions: fixture('conventions'),
};

describe('segment grammar parsing', () =>
  runCases(GRAMMAR_CASES, (row) => {
    const route = routers[row.fixture].routes.find((candidate) => candidate.pattern === row.pattern);

    expect(route).toBeDefined();
    expect(route!.segments.map((segment) => [segment.kind, segment.name ?? null, segment.matcher ?? null])).toEqual(row.segments);
  }));
