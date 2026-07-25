import { Glob } from 'bun';
import { describe, expect, it } from 'bun:test';
import { dirname, join } from 'node:path';
import { caseKey, isCaseTable, type Case } from './support/case';

/**
 * The anti-padding guard. A corpus that grows by permutation instead of by
 * behaviour is worthless, so every `*.cases.ts` row is fingerprinted here:
 * two rows may never share an id, nor an input/expected pair.
 */

const ROOT = dirname(import.meta.path);
const ID_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SRC_SHAPE = /^(janux|[a-z0-9.-]+:[^\s]+)$/;

interface Row {
  row: Case<object>;
  table: string;
}

async function loadRows(): Promise<Row[]> {
  const files = [...new Glob('**/*.cases.ts').scanSync(ROOT)].sort();
  const loaded = await Promise.all(files.map((file) => rowsIn(file)));

  return loaded.flat();
}

async function rowsIn(file: string): Promise<Row[]> {
  const mod: Record<string, unknown> = await import(join(ROOT, file));
  const tables = Object.entries(mod).filter(([, value]) => isCaseTable(value));

  return tables.flatMap(([name, table]) =>
    (table as Case<object>[]).map((row) => ({ row, table: `${file}:${name}` })),
  );
}

const rows = await loadRows();

describe('corpus integrity', () => {
  it('found case tables to check', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('gives every case a unique id', () => {
    expect(duplicatesBy(rows, ({ row }) => row.id)).toEqual([]);
  });

  it('never repeats the same input/expected pair', () => {
    expect(duplicatesBy(rows, ({ row }) => caseKey(row))).toEqual([]);
  });

  it('names every id in kebab-case', () => {
    expect(rows.filter(({ row }) => !ID_SHAPE.test(row.id)).map(({ row }) => row.id)).toEqual([]);
  });

  it('credits a source for every case', () => {
    expect(rows.filter(({ row }) => !SRC_SHAPE.test(row.src)).map(({ row }) => row.id)).toEqual([]);
  });
});

/** Reports collisions as `key → tables` so a failure points at both offenders. */
function duplicatesBy(all: Row[], keyOf: (row: Row) => string): string[] {
  const seen = new Map<string, string[]>();

  all.forEach((entry) => {
    const key = keyOf(entry);

    seen.set(key, [...(seen.get(key) ?? []), entry.table]);
  });

  return [...seen.entries()]
    .filter(([, tables]) => tables.length > 1)
    .map(([key, tables]) => `${key.slice(0, 120)} → ${tables.join(', ')}`);
}
