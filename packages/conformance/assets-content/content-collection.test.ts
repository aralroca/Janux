import { afterAll, describe, expect } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { schema, str } from 'janux';
import { defineCollection, getCollection, getEntry } from '../../janux-content/src/collection';
import { runCases } from '../support/scenario';
import { COLLECTION_CASES, COLLECTION_ERROR_CASES } from './content-collection.cases';

const ROOT = join(import.meta.dir, '.tmp-collections');
const POST = schema({ title: str() });

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** Writes a row's files into a directory of its own, so rows cannot see each other's. */
function directoryFor(id: string, files: Record<string, string>): string {
  const dir = join(ROOT, id);

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  Object.entries(files).forEach(([name, contents]) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), contents);
  });

  return dir;
}

describe('content collections', () =>
  runCases(COLLECTION_CASES, (row) => {
    const collection = defineCollection({ dir: directoryFor(row.id, row.files), schema: POST });

    if (row.lookup === undefined) {
      expect(getCollection(collection).map((entry) => entry.id)).toEqual(row.expected as string[]);

      return;
    }

    expect(getEntry(collection, row.lookup)?.data.title ?? null).toBe(row.expected as string | null);
  }));

describe('content collection refusals', () =>
  runCases(COLLECTION_ERROR_CASES, (row) => {
    const collection = defineCollection({ dir: directoryFor(row.id, row.files), schema: POST });

    expect(() => getCollection(collection)).toThrow(row.expected);
  }));
