/**
 * Counts the suite the way `bun test` counts it, grouped by area.
 *
 * Exists to keep two claims honest: the README badge, and the promise that the
 * corpus grows by behaviour rather than by permutation — an area whose test
 * count jumps without its branch coverage moving is padding, and this is where
 * you see it.
 *
 *   bun scripts/test-census.ts            # print the table
 *   bun scripts/test-census.ts --require 10000
 */
const TARGETS = [
  'packages/janux',
  'packages/janux-server',
  'packages/janux-agent',
  'packages/janux-vite',
  'packages/janux-cli',
  'packages/janux-tailwind',
  'packages/conformance',
  'packages/docs-tests',
  'apps/docs',
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

function byArea(perFile: Map<string, number>): Map<string, { files: number; tests: number }> {
  const areas = new Map<string, { files: number; tests: number }>();

  [...perFile.entries()].forEach(([file, tests]) => {
    const area = areaOf(file);
    const current = areas.get(area) ?? { files: 0, tests: 0 };

    areas.set(area, { files: current.files + 1, tests: current.tests + tests });
  });

  return areas;
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

  return { junit: await Bun.file(REPORT).text(), coverage: parseCoverage(stdout + stderr) };
}

function parseCoverage(output: string): Coverage | undefined {
  const found = ALL_FILES.exec(output);

  if (!found) return undefined;

  return { functions: Number(found[1]) / 100, lines: Number(found[2]) / 100 };
}

function render(areas: Map<string, { files: number; tests: number }>): number {
  const rows = [...areas.entries()].sort((a, b) => b[1].tests - a[1].tests);
  const total = rows.reduce((sum, [, { tests }]) => sum + tests, 0);
  const width = Math.max(...rows.map(([area]) => area.length));

  rows.forEach(([area, { files, tests }]) =>
    console.log(`${area.padEnd(width)}  ${String(files).padStart(4)} files  ${String(tests).padStart(6)} tests`),
  );
  console.log(`${'TOTAL'.padEnd(width)}  ${String(rows.reduce((s, [, r]) => s + r.files, 0)).padStart(4)} files  ${String(total).padStart(6)} tests`);

  return total;
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

if (shortfall) console.error(`census: ${total} tests, ${required} required — ${required - total} short.`);
if (thin) console.error(`census: coverage below the ${(minCoverage * 100).toFixed(0)}% floor.`);
if (shortfall || thin) process.exit(1);
