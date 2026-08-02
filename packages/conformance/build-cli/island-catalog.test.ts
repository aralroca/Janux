import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  CATALOG_CASES,
  CATALOG_URL,
  ISLAND_NAMES_CASES,
  collectIslands,
  islandNamesIn,
} from './island-catalog.cases';

describe('the island names a module declares', () =>
  runCases(ISLAND_NAMES_CASES, (row) => {
    expect(islandNamesIn(row.code, row.tsx ?? true)).toEqual(row.names);
  }));

describe('the modules a build catalogues', () =>
  runCases(CATALOG_CASES, (row) => {
    const catalog: Record<string, string> = {};

    collectIslands(catalog, row.moduleId, row.code);

    expect(catalog).toEqual(row.collected ? { a: CATALOG_URL } : {});
  }));
