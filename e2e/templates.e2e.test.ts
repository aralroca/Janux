import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The templates/ gallery scaffolds PRODUCTS, and each one's promise is the
 * acceptance bar of `create-janux --template`: the app serves, the agent
 * surface carries the advertised guards, and `janux eval` — the same command
 * the template's README wires into CI — exits 0 on its scripted agent tasks.
 * The browser suites then prove the no-model story: every flow below runs
 * without any API key anywhere.
 */

const CLI_TIMEOUT = 120_000;
const TEMPLATES = ['dashboard', 'back-office', 'content-site'] as const;
const EVAL_PORTS: Record<(typeof TEMPLATES)[number], number> = { dashboard: 4870, 'back-office': 4871, 'content-site': 4872 };

function runEvals(template: (typeof TEMPLATES)[number]): { code: number; reports: { name: string; pass: boolean }[] } {
  const port = EVAL_PORTS[template];
  const args = ['eval', '--json', '--start', `bunx janux start --port ${port}`, '--url', `http://localhost:${port}`];
  const proc = Bun.spawnSync(['bunx', 'janux', ...args], { cwd: appRoot(`templates/${template}`), stdout: 'pipe', stderr: 'pipe' });

  return { code: proc.exitCode, reports: JSON.parse(proc.stdout.toString()) };
}

describe.each([...TEMPLATES])('templates/%s — the shipped evals are green', (template) => {
  it(
    'janux eval exits 0 and every scenario passes',
    () => {
      const { code, reports } = runEvals(template);

      expect(code).toBe(0);
      expect(reports.length).toBeGreaterThan(0);
      expect(reports.every((report) => report.pass)).toBe(true);
    },
    CLI_TIMEOUT,
  );
});

describe('templates SSR and manifest', () => {
  it('dashboard: serves the board and a manifest where only maintenance needs a human', async () => {
    const app = await createTestApp(appRoot('templates/dashboard'));
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('INC-101');
    expect(html).toContain('Copilot');

    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.filter((tool: any) => tool.name.startsWith('api.')).map((tool: any) => [tool.name, tool.guard]));

    expect(guards).toEqual({
      'api.ops.board': 'auto',
      'api.ops.acknowledge': 'auto',
      'api.ops.resolve': 'auto',
      'api.ops.maintenance': 'confirm',
    });
  });

  it('back-office: serves the desk and guards exactly the destructive tool', async () => {
    const app = await createTestApp(appRoot('templates/back-office'));
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Audit trail');

    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const confirmTools = manifest.tools.filter((tool: any) => tool.guard === 'confirm').map((tool: any) => tool.name);

    expect(confirmTools).toEqual(['desk.remove', 'api.customers.remove']);
  });

  it('content-site: llms.txt indexes the published posts and the tools, never the draft', async () => {
    const app = await createTestApp(appRoot('templates/content-site'));
    const llms = await (await app.fetch('/llms.txt')).text();

    expect(llms).toContain('/posts/launching-this-site');
    expect(llms).toContain('api.site.search');
    expect(llms).not.toContain('still-a-draft');

    const markdown = await (await app.fetch('/posts/agents-read-this-site.md')).text();

    expect(markdown).toContain('# Agents read this site natively');
  });
});

/**
 * One served template, for the length of one describe. Every browser case below
 * wants the same four lines, and `isBuilt` guards them all: without a build the
 * suite skips rather than failing on a missing `dist/client`.
 */
function servedTemplate(template: string) {
  const state = { base: '', browser: undefined as Browser | undefined };
  let stop: (() => void) | undefined;

  beforeAll(async () => {
    ({ url: state.base, stop } = await startTestServer(appRoot(`templates/${template}`)));
    state.browser = await launchBrowser();
  });

  afterAll(() => stop?.());

  return state;
}

/** The no-model story, end to end: scripted demo → real proposal → human approval. */
describe.skipIf(!isBuilt(appRoot('templates/dashboard')))('templates/dashboard in the browser, without any API key', () => {
  const app = servedTemplate('dashboard');

  it(
    'the demo chip triages with real tool calls and maintenance waits for the human',
    async () => {
      const { page, errors } = await openPage(app.browser!);

      await page.goto(`${app.base}/`);
      await page.waitForSelector('.board tbody tr');
      await page.click('.chip.demo');

      // The scripted demo acknowledged and resolved INC-101 through the bridge…
      await page.waitForSelector('.badge.resolved');
      // …and its maintenance call parked as a proposal instead of executing.
      await page.waitForSelector('.proposal');
      // TEMPORARY DIAGNOSTIC — remove once the WebKit-on-Linux failure is understood.
      if ((await page.locator('.maintenance').count()) !== 0) {
        const board = await (await fetch(`${app.base}/_janux/agent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [], path: '/' }),
        }).catch(() => undefined))?.text();

        console.log('DIAG maintenance text:', await page.locator('.maintenance').allTextContents());
        console.log('DIAG activity:', await page.locator('.activity li').allTextContents());
        console.log('DIAG chat:', await page.locator('.chat li').allTextContents());
        console.log('DIAG proposal:', await page.locator('.proposal p').allTextContents());
        console.log('DIAG agent probe:', board?.slice(0, 300));
      }
      expect(await page.locator('.maintenance').count()).toBe(0);

      await page.click('.proposal button:has-text("Approve")');
      await page.waitForSelector('.maintenance');

      expect(await page.locator('.board tbody tr').count()).toBe(3);
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});

describe.skipIf(!isBuilt(appRoot('templates/back-office')))('templates/back-office in the browser', () => {
  const app = servedTemplate('back-office');

  it(
    'an agent-origin delete parks in the inbox; approving removes the row and audits it',
    async () => {
      const { page, errors } = await openPage(app.browser!);

      await page.goto(`${app.base}/`);
      await page.waitForSelector('.desk tbody tr');
      const rows = await page.locator('.desk tbody tr').count();

      // Trigger the confirm-guarded delete the way an agent would, via the panel.
      const removeRow = page.locator('.tool-row', { has: page.locator('code', { hasText: /^api\.customers\.remove$/ }) });

      await removeRow.locator('button').click();
      await page.waitForSelector('.proposal-card');
      expect(await page.locator('.desk tbody tr').count()).toBe(rows);

      await page.click('.proposal-card button.approve');
      await page.waitForFunction((total) => document.querySelectorAll('.desk tbody tr').length === total - 1, rows, { timeout: 10_000 });

      expect(await page.locator('.audit .entry').count()).toBeGreaterThan(0);
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});

describe.skipIf(!isBuilt(appRoot('templates/content-site')))('templates/content-site in the browser', () => {
  const app = servedTemplate('content-site');

  it(
    'the search box answers through the same tool agents call',
    async () => {
      const { page, errors } = await openPage(app.browser!);

      await page.goto(`${app.base}/`);
      await page.fill('.search input', 'frontmatter');
      await page.click('.search button');
      await page.waitForSelector('.search-hits li');

      expect(await page.locator('.search-hits li').count()).toBeGreaterThan(0);
      await page.waitForSelector('.search-hits li a:has-text("Writing in markdown")');
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});
