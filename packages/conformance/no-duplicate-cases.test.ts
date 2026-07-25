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
    expect(offenders(ID_SHAPE, (row) => row.id)).toEqual([]);
  });

  it('credits a source for every case', () => {
    expect(offenders(SRC_SHAPE, (row) => row.src)).toEqual([]);
  });
});

/** Ids of the rows whose `pick`ed field does not match `shape`. */
function offenders(shape: RegExp, pick: (row: Case<object>) => string): string[] {
  return rows.filter(({ row }) => !shape.test(pick(row))).map(({ row }) => row.id);
}

/** Reports collisions as `key → tables` so a failure points at both offenders. */
function duplicatesBy(all: Row[], keyOf: (row: Row) => string): string[] {
  return [...Map.groupBy(all, keyOf)]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => `${key.slice(0, 120)} → ${entries.map((entry) => entry.table).join(', ')}`);
}
