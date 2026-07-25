/**
 * The docs site's Lighthouse gate.
 *
 * Serves the built export the way a production host does (scripts/serve-dist.ts)
 * and audits a representative page of each kind. Accessibility, best practices
 * and SEO are asserted at a flat 100: they measure the markup, so anything less
 * is a defect, not weather. Performance is asserted just under, because its
 * score is a function of the machine — a CI runner is slower and noisier than a
 * laptop, and a gate that goes red on its own is a gate people learn to ignore.
 *
 * Every URL is audited three times and the median of each category is what gets
 * asserted, since a single run is not evidence.
 *
 *   bun scripts/lighthouse.ts                       # gate
 *   bun scripts/lighthouse.ts --runs 1              # quick local check
 *   bun scripts/lighthouse.ts --reports ./lh-out    # keep the JSON
 *   bun scripts/lighthouse.ts --dist path/to/dist   # audit another export
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_DIST = 'apps/docs/dist/client';
const PORT = 4322;
/** One of each kind of page: the marketing home, a docs page, the editor. */
const PAGES = ['/', '/docs/getting-started/what-is-janux', '/playground'];
const THRESHOLDS: Record<string, number> = {
  performance: 0.99,
  accessibility: 1,
  'best-practices': 1,
  seo: 1,
  // Lighthouse's agentic-browsing category: whether an agent can read and
  // operate the page. For this framework that is not a nice-to-have, so it is
  // asserted at 100 like the other markup-measuring categories.
  'agentic-browsing': 1,
};
const CATEGORIES = Object.keys(THRESHOLDS).join(',');
/**
 * The colour scheme is pinned. The palette is built on `light-dark()`, so an
 * unpinned scheme means contrast is measured against whichever mode the runner
 * happens to prefer — the light palette was the failing one, and a gate that
 * silently audits the other half is no gate. The dark half is covered
 * deterministically by apps/docs/src/palette.test.ts.
 */
const CHROME_FLAGS = '--headless=new --no-sandbox --blink-settings=preferredColorScheme=1';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => args[args.indexOf(name) + 1] ?? fallback;
const runs = Number(flag('--runs', '3'));
const dist = flag('--dist', DEFAULT_DIST);
const reportDir = args.includes('--reports') ? flag('--reports', '.') : mkdtempSync(join(tmpdir(), 'janux-lh-'));

mkdirSync(reportDir, { recursive: true });

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const reached = await fetch(url).then(() => true).catch(() => false);

    if (reached) return;
    await Bun.sleep(200);
  }
  throw new Error(`serve-dist never came up on ${url}`);
}

/** One audit, returning the category scores of that run. */
async function audit(url: string, index: number): Promise<Record<string, number>> {
  const output = join(reportDir, `${url.replace(/\W+/g, '-') || 'home'}-${index}.json`);
  const proc = Bun.spawn(
    ['bunx', 'lighthouse', `http://localhost:${PORT}${url}`, '--output=json', `--output-path=${output}`,
      `--only-categories=${CATEGORIES}`,
      '--form-factor=mobile', '--screenEmulation.mobile', `--chrome-flags=${CHROME_FLAGS}`, '--quiet'],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  if ((await proc.exited) !== 0) throw new Error(`lighthouse failed on ${url}: ${await new Response(proc.stderr).text()}`);
  const report = await Bun.file(output).json();

  return Object.fromEntries(Object.entries(report.categories).map(([name, c]: [string, any]) => [name, c.score ?? 0]));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)]!;
}

async function medianScores(url: string): Promise<Record<string, number>> {
  const results: Record<string, number>[] = [];

  for (let index = 0; index < runs; index += 1) results.push(await audit(url, index));

  return Object.fromEntries(
    Object.keys(THRESHOLDS).map((category) => [category, median(results.map((run) => run[category] ?? 0))]),
  );
}

function report(url: string, scores: Record<string, number>): string[] {
  const cells = Object.keys(THRESHOLDS).map((category) => {
    const score = scores[category] ?? 0;
    const failed = score < THRESHOLDS[category]!;

    return { category, text: `${category} ${Math.round(score * 100)}${failed ? ' ✗' : ''}`, failed };
  });

  console.log(`  ${(url || '/').padEnd(42)} ${cells.map((cell) => cell.text).join('  ')}`);

  return cells.filter((cell) => cell.failed).map((cell) => `${url || '/'} → ${cell.category} ${Math.round((scores[cell.category] ?? 0) * 100)} (needs ${Math.round(THRESHOLDS[cell.category]! * 100)})`);
}

const server = Bun.spawn(['bun', 'scripts/serve-dist.ts', dist, String(PORT)], { stdout: 'ignore', stderr: 'inherit' });
const failures: string[] = [];

// `process.exit` skips `finally`, which orphaned the server on every red run and
// left the port held by a process serving a stale directory — so the exit lives
// outside: the server is always reaped, then the status is reported.
try {
  await waitForServer(`http://localhost:${PORT}/`);
  console.log(`\nlighthouse: ${PAGES.length} pages × ${runs} run(s), median, mobile, light scheme\n`);

  for (const page of PAGES) failures.push(...report(page, await medianScores(page)));

  console.log(`\n  reports: ${reportDir}\n`);
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(`lighthouse gate failed:\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  process.exit(1);
}
console.log('lighthouse gate passed.\n');
