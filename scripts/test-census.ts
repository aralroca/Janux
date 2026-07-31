/**
 * Counts the suite the way `bun test` counts it, grouped by area.
 *
 * Exists to keep two claims honest: the README badge, and the promise that the
 * corpus grows by behaviour rather than by permutation — an area whose test
 * count jumps without its branch coverage moving is padding, and this is where
 * you see it.
 *
 * It is also the one place that knows the real total, so it fails when a
 * document claims a different one — that is what keeps the number in the README
 * and in the architecture guide from being written by hand and left to rot.
 *
 *   bun scripts/test-census.ts            # print the table
 *   bun scripts/test-census.ts --require 10000
 */
import { testCountClaims } from '../packages/docs-tests/documented-test-count';

const TARGETS = [
  'packages/janux',
  'packages/janux-server',
  'packages/janux-agent',
  'packages/janux-content',
  'packages/janux-vite',
  'packages/janux-cli',
  'packages/janux-tailwind',
  'packages/conformance',
  'packages/docs-tests',
  'apps/docs',
  'scripts',
  // Only the bin: the `template/` beside it is scaffolding for a generated app,
  // not a workspace, so its own tests cannot resolve `janux` from here.
  'packages/create-janux/bin.test.ts',
];

const REPORT = '.census-junit.xml';
const SUITE_FILE = /<testsuite\b[^>]*\bfile="([^"]+)"/;
const TESTCASE = /<testcase\b/;
/** Bun's coverage summary row: `All files | 89.33 | 90.35 |`. */
const ALL_FILES = /^All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/m;

/** `packages/conformance/state/x.test.ts` → `conformance:state`; `packages/janux/src/a/b` → `janux`. */
function areaOf(file: string): string {
  const parts = file.split('/');
  const nested = parts[2] ?? '';

  if (parts[1] === 'conformance') return nested.includes('.') ? 'conformance' : `conformance:${nested}`;

  return parts.slice(0, 2).join('/').replace('packages/', '');
}

function countByFile(xml: string): Map<string, number> {
  const counts = new Map<string, number>();
  let file = '';

  xml.split('\n').forEach((line) => {
    file = SUITE_FILE.exec(line)?.[1] ?? file;
    if (TESTCASE.test(line)) counts.set(file, (counts.get(file) ?? 0) + 1);
  });

  return counts;
}

interface AreaStats {
  files: number;
  tests: number;
}

function byArea(perFile: Map<string, number>): Map<string, AreaStats> {
  const grouped = Map.groupBy([...perFile], ([file]) => areaOf(file));

  return new Map(
    [...grouped].map(([area, files]) => [
      area,
      { files: files.length, tests: files.reduce((sum, [, tests]) => sum + tests, 0) },
    ]),
  );
}

interface Coverage {
  functions: number;
  lines: number;
}

/** One run produces both numbers: junit for the counts, the table for coverage. */
async function collect(): Promise<{ junit: string; coverage: Coverage | undefined }> {
  const run = Bun.spawn(
    ['bun', 'test', ...TARGETS, '--coverage', '--reporter=junit', `--reporter-outfile=${REPORT}`],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);

  await run.exited;

  return { junit: await Bun.file(REPORT).text(), coverage: parseCoverage(stdout) ?? parseCoverage(stderr) };
}

function parseCoverage(output: string): Coverage | undefined {
  const found = ALL_FILES.exec(output);

  if (!found) return undefined;

  return { functions: Number(found[1]) / 100, lines: Number(found[2]) / 100 };
}

function render(areas: Map<string, AreaStats>): number {
  const rows = [...areas.entries()].sort((a, b) => b[1].tests - a[1].tests);
  const width = Math.max(...rows.map(([area]) => area.length), 'TOTAL'.length);
  const line = (area: string, { files, tests }: AreaStats) =>
    `${area.padEnd(width)}  ${String(files).padStart(4)} files  ${String(tests).padStart(6)} tests`;
  const totals = rows.reduce<AreaStats>(
    (sum, [, stats]) => ({ files: sum.files + stats.files, tests: sum.tests + stats.tests }),
    { files: 0, tests: 0 },
  );

  rows.forEach(([area, stats]) => console.log(line(area, stats)));
  console.log(line('TOTAL', totals));

  return totals.tests;
}

function flag(name: string): number {
  return Number(Bun.argv[Bun.argv.indexOf(name) + 1]) || 0;
}

const required = flag('--require');
const minCoverage = flag('--min-coverage');
const { junit, coverage } = await collect();
const total = render(byArea(countByFile(junit)));

if (coverage) {
  console.log(`\ncoverage  functions ${(coverage.functions * 100).toFixed(2)}%  lines ${(coverage.lines * 100).toFixed(2)}%`);
}

await Bun.file(REPORT)
  .delete()
  .catch(() => {});

const shortfall = required > 0 && total < required;
const thin = minCoverage > 0 && (!coverage || coverage.lines < minCoverage || coverage.functions < minCoverage);
/** A badge states its number twice (src and alt), so report each document once. */
const stale = [
  ...new Set(
    testCountClaims()
      .filter(({ count }) => count !== total)
      .map(({ file, count }) => `${file} claims ${count} tests`),
  ),
];

if (shortfall) console.error(`census: ${total} tests, ${required} required — ${required - total} short.`);
if (thin) console.error(`census: coverage below the ${(minCoverage * 100).toFixed(0)}% floor.`);
stale.forEach((claim) => console.error(`census: ${claim}, the suite has ${total}.`));
if (shortfall || thin || stale.length > 0) process.exit(1);
