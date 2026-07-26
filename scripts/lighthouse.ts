/**
 * The docs site's Lighthouse gate.
 *
 * Runs the docs app the way production runs it — `janux start`, the Bun server
 * the site deploys as — and audits a representative page of each kind.
 * (`--dist` audits a prerendered export through scripts/serve-dist.ts instead,
 * which is what a static app deploys.) Accessibility, best practices
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
 *   bun scripts/lighthouse.ts --dist path/to/dist   # audit a static export instead
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_DIR = 'apps/docs';
const PORT = 4322;
/** One of each kind of page: the marketing home, a docs page, the editor. */
const PAGES: { path: string; performance?: number; bars?: Record<string, number> }[] = [
  /*
   * The home page is 85 KB of server-rendered HTML: compressed by the server,
   * but with no CDN in front of it to cache, so it costs a point or two of LCP
   * that the deployed page does not pay. The bar is 95; everything else on this
   * page is still asserted at 100.
   */
  { path: '/', performance: 0.95 },
  { path: '/docs/getting-started/what-is-janux' },
  /*
   * The playground ships Monaco, so its paint metrics measure an editor rather
   * than the framework. The bar is 0.60 against 94 on a laptop and 71 on a
   * two-core CI runner: an IDE page costs ~20 points of CPU-bound score on
   * hardware like that, and the gap is not something the code can close. What is
   * left is enough headroom for runner noise and tight enough to catch losing
   * any of the three things that got the page here — the server compressing what
   * it serves, the editor being imported without Monaco's 80-odd languages, and
   * the page painting its code before the editor arrives — since each of those
   * is worth 20 points or more on its own.
   *
   * `best-practices` is 0.85 for two audits neither the app nor the framework
   * owns: Monaco's hidden textarea trips `paste-preventing-inputs` (it
   * implements paste itself), and `valid-source-maps` wants maps for a
   * production build — `janux build` overrides the app's `build` options, so an
   * app cannot ask for them yet. Accessibility, SEO and agentic-browsing stay at
   * 100, editor and all.
   */
  { path: '/playground', performance: 0.6, bars: { 'best-practices': 0.85 } },
];
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

/** `undefined` rather than a fallback param, so a computed default is just `??`. */
function flag(name: string): string | undefined {
  const index = args.indexOf(name);

  return index === -1 ? undefined : args[index + 1];
}

const runs = Number(flag('--runs') ?? 3);
const dist = flag('--dist');
const reportDir = flag('--reports') ?? mkdtempSync(join(tmpdir(), 'janux-lh-'));

mkdirSync(reportDir, { recursive: true });

/** The app's own production server, unless a static export was named. */
function serverCommand(): string[] {
  if (dist) return ['bun', 'scripts/serve-dist.ts', dist, String(PORT)];

  return ['bun', '../../packages/janux-cli/bin.ts', 'start', '--port', String(PORT)];
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const reached = await fetch(url).then(() => true).catch(() => false);

    if (reached) return;
    await Bun.sleep(200);
  }
  throw new Error(`the docs server never came up on ${url}`);
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

const percent = (score: number) => Math.round(score * 100);

function report(url: string, scores: Record<string, number>, thresholds: Record<string, number>): string[] {
  const page = url || '/';
  const cells = Object.entries(thresholds).map(([category, needs]) => {
    const score = scores[category] ?? 0;

    return {
      cell: `${category} ${percent(score)}${score < needs ? ' ✗' : ''}`,
      failure: score < needs ? `${page} → ${category} ${percent(score)} (needs ${percent(needs)})` : undefined,
    };
  });

  console.log(`  ${page.padEnd(42)} ${cells.map(({ cell }) => cell).join('  ')}`);

  return cells.map(({ failure }) => failure).filter((failure): failure is string => failure !== undefined);
}

const server = Bun.spawn(serverCommand(), { cwd: dist ? undefined : APP_DIR, stdout: 'ignore', stderr: 'inherit' });
const failures: string[] = [];

// `process.exit` skips `finally`, which orphaned the server on every red run and
// left the port held by a process serving a stale directory — so the exit lives
// outside: the server is always reaped, then the status is reported.
try {
  await waitForServer(`http://localhost:${PORT}/`);
  console.log(`\nlighthouse: ${PAGES.length} pages × ${runs} run(s), median, mobile, light scheme\n`);

  for (const page of PAGES) {
    const thresholds = { ...THRESHOLDS, ...(page.performance ? { performance: page.performance } : {}), ...page.bars };

    failures.push(...report(page.path, await medianScores(page.path), thresholds));
  }

  console.log(`\n  reports: ${reportDir}\n`);
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(`lighthouse gate failed:\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  process.exit(1);
}
console.log('lighthouse gate passed.\n');
