import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { CODEMODS } from './registry';
import type { Codemod } from './types';

/**
 * Every codemod, held to a before/after pair on disk.
 *
 * The pairs are the readable half of the contract: a reviewer sees the file a
 * user has and the file they get, side by side, without reading a single
 * assertion. This suite then holds each pair to two things — that the codemod
 * produces exactly that output, and that running it on its own output produces
 * nothing further.
 *
 * The second is the one that matters in the field. A codemod is run twice: once
 * by accident, once because a merge brought half a tree back. Idempotence is
 * what makes the second run free instead of destructive, and it is asserted
 * here for every fixture rather than argued for once in a comment.
 */

const FIXTURES = join(import.meta.dir, '__fixtures__');
/** The path a fixture stands in for, since a route codemod's whole answer is a path. */
const FILE_DIRECTIVE = /^\/\/ @file: (.+)\r?\n/;

interface FixtureCase {
  name: string;
  from: string;
  to: string;
  input: string;
  output: string;
}

/** The declared path and the source under it — the directive is scaffolding, not content. */
function split(body: string, fallback: string): { path: string; code: string } {
  const match = FILE_DIRECTIVE.exec(body);

  return match ? { path: match[1]!.trim(), code: body.slice(match[0].length) } : { path: fallback, code: body };
}

function caseFor(dir: string, file: string): FixtureCase {
  const name = file.replace(/\.input\.[\w]+$/, '');
  const extension = extname(file);
  const outputFile = readdirSync(dir).find((entry) => entry.startsWith(`${name}.output.`));
  const input = split(readFileSync(join(dir, file), 'utf8'), `src/${name}${extension}`);
  const output = split(readFileSync(join(dir, outputFile!), 'utf8'), input.path);

  return { name, from: input.path, to: output.path, input: input.code, output: output.code };
}

/** The before/after pairs for one codemod, read off `__fixtures__/<id>`. */
function fixturesFor(id: string): FixtureCase[] {
  const dir = join(FIXTURES, id);

  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.includes('.input.'))
    .sort()
    .map((file) => caseFor(dir, file));
}

/** What the codemod does to one fixture: the source it answers, and where it puts it. */
function applied(codemod: Codemod, code: string, file: string): { code: string; file: string } {
  const result = codemod.run({ code, file });

  return { code: result.code ?? code, file: result.moveTo ?? file };
}

describe('every codemod has before/after fixtures', () => {
  for (const codemod of CODEMODS) {
    it(`${codemod.id} has at least one pair`, () => {
      expect(fixturesFor(codemod.id).length).toBeGreaterThan(0);
    });
  }
});

for (const codemod of CODEMODS) {
  describe(codemod.id, () => {
    for (const fixture of fixturesFor(codemod.id)) {
      it(`${fixture.name}: turns the input into the output`, () => {
        const result = applied(codemod, fixture.input, fixture.from);

        expect(result.code).toBe(fixture.output);
        expect(result.file).toBe(fixture.to);
      });

      it(`${fixture.name}: running it again changes nothing more`, () => {
        const once = applied(codemod, fixture.input, fixture.from);
        const twice = applied(codemod, once.code, once.file);

        expect(twice.code).toBe(once.code);
        expect(twice.file).toBe(once.file);
      });
    }
  });
}
