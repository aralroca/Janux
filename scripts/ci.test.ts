import { Glob } from 'bun';
import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The CI workflow makes claims the repository must keep true: the Bun floor it
 * tests is the floor `engines` declares, the unit suite runs on the three OSes
 * it promises, every browser the e2e matrix names is really driven, and every
 * job reports into the one aggregate check branch protection requires. YAML has
 * no compiler, so this is where those claims are checked.
 */
const ROOT = join(import.meta.dir, '..');
// CRLF-proof: these guards must hold whatever line endings a checkout has.
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8').replaceAll('\r\n', '\n');

/** The one `>=x.y.z` Bun bound the packages agree on, digits only. */
function enginesFloor(): string {
  const manifests = readdirSync(join(ROOT, 'packages'))
    .map((dir) => join(ROOT, 'packages', dir, 'package.json'))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, 'utf8')));
  const bounds = [...new Set(manifests.map((pkg) => pkg.engines?.bun).filter(Boolean))] as string[];

  expect(bounds).toHaveLength(1);

  return (bounds[0] as string).replace('>=', '').trim();
}

/**
 * A lifecycle hook whose callback is followed by a timeout: `beforeAll(async
 * () => { … }, 60_000)`. Anchored on the closing brace at the start of a line,
 * which is where a hook body ends and no other call in these files does.
 */
const TIMED_HOOK = /\b(?:before|after)(?:All|Each)\(([\s\S]*?)^\}\s*,\s*[\d_]+\s*\)/m;

/** The flow-style list a matrix axis declares, e.g. `os: [a, b]` → ['a', 'b']. */
function matrixAxis(name: string): string[] {
  const match = WORKFLOW.match(new RegExp(`^\\s+${name}:\\s*\\[([^\\]]*)\\]`, 'm'));

  return (match?.[1] ?? '').split(',').map((entry) => entry.trim().replace(/['"]/g, ''));
}

describe('the CI workflow', () => {
  it('tests the exact Bun floor engines declares, and latest', () => {
    expect(matrixAxis('bun')).toEqual([enginesFloor(), 'latest']);
  });

  it('runs the unit suite on the three OSes', () => {
    expect(matrixAxis('os').toSorted()).toEqual(['macos-latest', 'ubuntu-latest', 'windows-latest']);
  });

  it('drives the e2e suite in the three browser engines', () => {
    expect(matrixAxis('browser').toSorted()).toEqual(['chromium', 'firefox', 'webkit']);
  });

  it('never branches on runner.os — a Windows failure is a bug to fix, not to skip', () => {
    expect(WORKFLOW).not.toMatch(/\$\{\{[^}]*runner\.os/);
  });

  it('scans the code with CodeQL and the lockfile with osv-scanner', () => {
    expect(WORKFLOW).toContain('github/codeql-action/init');
    expect(WORKFLOW).toContain('osv-scanner');
  });

  /**
   * `beforeAll(fn, ms)` throws before Bun 1.3.2 ("expects a function as the
   * second argument"), and the file that uses it fails to load rather than to
   * assert — so the floor lane reports a module error, not a named test. Two
   * suites carried it; a third would only be found by CI. Slow setup goes at
   * module scope, which carries no deadline.
   */
  it('never lifts a hook deadline with a form the Bun floor rejects', async () => {
    const files = await Array.fromAsync(new Glob('**/*.test.ts').scan({ cwd: ROOT }));
    const offenders = files
      .filter((file) => !file.includes('node_modules'))
      .filter((file) => TIMED_HOOK.test(readFileSync(join(ROOT, file), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('feeds every job into the single aggregate check, so none escapes branch protection', () => {
    const jobs = [...WORKFLOW.slice(WORKFLOW.indexOf('\njobs:')).matchAll(/^  ([\w-]+):$/gm)].map((m) => m[1] as string);
    const needs = WORKFLOW.match(/^  ci:\n(?:.*\n)*?\s+needs:\s*\[([^\]]*)\]/m);
    const needed = (needs?.[1] ?? '').split(',').map((entry) => entry.trim());

    expect(jobs.length).toBeGreaterThan(1);
    expect(needed.toSorted()).toEqual(jobs.filter((job) => job !== 'ci').toSorted());
  });
});
