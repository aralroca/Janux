import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from './support/app';
import { UNTESTED_EXAMPLES } from './untested-examples';

/**
 * The examples/ analog of docs-tests' page-coverage: every example must have a
 * dedicated e2e suite (or a deliberate backlog entry) and must be listed where
 * users look for it. Forgetting either is a test failure, not a silent gap.
 */

const EXAMPLES = readdirSync(appRoot('examples'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const SUITES = readdirSync(import.meta.dir)
  .filter((file) => file.endsWith('.e2e.test.ts') && file !== 'examples-smoke.e2e.test.ts')
  .map((file) => readFileSync(join(import.meta.dir, file), 'utf8'))
  .join('\n');
const README = readFileSync(join(appRoot('.'), 'README.md'), 'utf8');
const DOCS_PAGE = readFileSync(join(appRoot('apps/docs'), 'content/more/examples.md'), 'utf8');

describe('examples coverage', () => {
  it.each(EXAMPLES)('examples/%s has a dedicated e2e suite or a deliberate backlog entry', (name) => {
    const covered = SUITES.includes(`examples/${name}`) || UNTESTED_EXAMPLES.includes(name);

    expect(covered).toBe(true);
  });

  it.each(EXAMPLES)('examples/%s is listed in the README and the docs examples page', (name) => {
    expect(README).toContain(`examples/${name}`);
    expect(DOCS_PAGE).toContain(name);
  });

  it('keeps the backlog honest: no stale entries, and ideally empty', () => {
    expect(UNTESTED_EXAMPLES.filter((name) => !EXAMPLES.includes(name))).toEqual([]);
  });
});
