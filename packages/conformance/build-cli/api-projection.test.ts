import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  EXPORTS_CASES,
  MODULE_NAME_CASES,
  REJECTED_EXPORT_CASES,
  STUB_CASES,
  apiModuleName,
  apiStubModule,
  exportedApiNames,
} from './api-projection.cases';

describe('the exports an api module offers a client', () =>
  runCases(EXPORTS_CASES, (row) => {
    expect(exportedApiNames(row.code)).toEqual(row.names);
  }));

describe('the export shapes an api module may not use', () =>
  runCases(REJECTED_EXPORT_CASES, (row) => {
    expect(() => exportedApiNames(row.code)).toThrow(row.says);
  }));

describe('the client module the plugin generates', () =>
  runCases(STUB_CASES, (row) => {
    const generated = apiStubModule(row.filePath, row.code).trimEnd().split('\n').filter(Boolean);

    expect(generated).toEqual(row.lines);
    // Server code never reaches the browser: the stub is generated from the
    // export names alone, so nothing of the module body can survive in it.
    expect(generated.join('\n')).not.toContain('api({');
  }));

describe('the namespace an api module claims', () =>
  runCases(MODULE_NAME_CASES, (row) => {
    expect(apiModuleName(row.filePath)).toBe(row.name);
  }));
