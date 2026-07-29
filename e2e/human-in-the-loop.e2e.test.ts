import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/human-in-the-loop exists to demonstrate: the `confirm` guard as
 * an approvals queue. An agent invoking `payments.send` parks a Proposal in an
 * inbox island; the same intent from a human click executes instantly; and the
 * audit trail records both, each tagged with the origin that did it.
 */

const BUILT = isBuilt('examples/human-in-the-loop');

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];
let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

const ledgerCount = async () => {
  const body: any = await (await post('/_janux/api/payments.ledger', {})).json();

  return body.result.transfers.length;
};

const proposeTransfer = async () => {
  const response = await post(
    '/_janux/api/payments.transfer',
    { to: 'Acme Corp', amountCents: 12000 },
    { 'x-janux-origin': 'agent' },
  );

  return ((await response.json()) as any).result;
};

beforeAll(async () => {
  ({ server, get } = await ssrApp('examples/human-in-the-loop'));
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt('examples/human-in-the-loop'));
  browser = await launchChrome();
});

afterAll(() => {
  stop?.();
});

const openPage = () => newPage(browser!);

const statusOf = (page: Page, id: string) => page.locator(`[data-payment="${id}"] .status`).textContent();

describe('examples/human-in-the-loop server side', () => {
  it('server-renders the desk: seeded drafts, an empty inbox, an empty audit trail', async () => {
    const html = await (await get('/')).text();

    expect(html).toContain('Acme Corp');
    expect(html).toContain('120.00€');
    expect(html).toContain('Lumen Labs');
    expect(html).toContain('No pending proposals');
    expect(html).toContain('No sensitive actions yet');
  });

  it('advertises the contract: send/transfer confirm, draft/ledger auto, approve/reject invisible', async () => {
    const manifest: any = await (await get('/_janux/manifest?path=/')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards).toEqual({
      'payments.draft': 'auto',
      'payments.send': 'confirm',
      'api.payments.transfer': 'confirm',
      'api.payments.ledger': 'auto',
    });
    // Drafts exist, so the guarded send is ready — the manifest says so upfront.
    expect(manifest.tools.find((tool: any) => tool.name === 'payments.send').ready).toBe(true);
    // The inbox's approve/reject are forbidden: no agent ever sees them.
    expect(manifest.tools.filter((tool: any) => tool.name.startsWith('inbox.'))).toEqual([]);
  });

  it('agent-origin transfer parks a Proposal — approving executes it exactly once', async () => {
    const before = await ledgerCount();
    const proposed = await proposeTransfer();

    expect(proposed.status).toBe('proposal');
    expect(proposed.transferId).toBeUndefined();
    expect(await ledgerCount()).toBe(before);

    const approved: any = await (await post('/_janux/approve', { id: proposed.id })).json();

    expect(approved.result.transferId).toMatch(/^tr_/);
    expect(approved.result.amountCents).toBe(12000);
    expect(await ledgerCount()).toBe(before + 1);
    // The proposal is consumed: a replayed approval finds nothing to run.
    expect((await post('/_janux/approve', { id: proposed.id })).status).toBe(404);
  });

  it('a rejected proposal never executes', async () => {
    const before = await ledgerCount();
    const proposed = await proposeTransfer();
    const rejected: any = await (await post('/_janux/reject', { id: proposed.id })).json();

    expect(rejected.ok).toBe(true);
    expect((await post('/_janux/approve', { id: proposed.id })).status).toBe(404);
    expect(await ledgerCount()).toBe(before);
  });

  it('human-origin transfer executes directly: the click is the confirmation', async () => {
    const body: any = await (await post('/_janux/api/payments.transfer', { to: 'Lumen Labs', amountCents: 4550 })).json();

    expect(body.result.status).toBeUndefined();
    expect(body.result.transferId).toMatch(/^tr_/);
  });
});

describe.skipIf(!BUILT)('examples/human-in-the-loop in the browser', () => {
  it('an agent call on send parks in the inbox unexecuted; Approve runs it and clears the row', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("payments.send") button');
    await page.click('.tool-row:has-text("payments.send") button');
    await page.waitForSelector('.inbox .proposal-card');
    // Parked, not run: the draft did not move and the audit trail is still empty.
    expect(await statusOf(page, 'pay_acme')).toBe('draft');
    expect(await page.locator('.audit .entry').count()).toBe(0);

    await page.click('.inbox .proposal-card button.approve');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_acme"] .status')?.textContent === 'sent');
    await page.waitForFunction(() => document.querySelectorAll('.inbox .proposal-card').length === 0);
    expect(await page.locator('.audit .entry.agent').count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('Reject clears the proposal without executing it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("payments.send") button');
    await page.click('.tool-row:has-text("payments.send") button');
    await page.waitForSelector('.inbox .proposal-card');
    await page.click('.inbox .proposal-card button.reject');
    await page.waitForFunction(() => document.querySelectorAll('.inbox .proposal-card').length === 0);
    expect(await statusOf(page, 'pay_acme')).toBe('draft');
    expect(await page.locator('.audit .entry').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the same action from a human click executes directly — no proposal in between', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-payment="pay_lumen"] button.send');
    await page.click('[data-payment="pay_lumen"] button.send');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_lumen"] .status')?.textContent === 'sent');
    expect(await page.locator('.inbox .proposal-card').count()).toBe(0);
    expect(await page.locator('.audit .entry.human').count()).toBe(1);
    expect(await page.locator('.audit .entry.human').textContent()).toContain('Lumen Labs');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the audit trail tells the two faces apart: human and agent entries side by side', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-payment="pay_lumen"] button.send');
    await page.click('[data-payment="pay_lumen"] button.send');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_lumen"] .status')?.textContent === 'sent');

    await page.waitForSelector('.tool-row:has-text("payments.send") button');
    await page.click('.tool-row:has-text("payments.send") button');
    await page.waitForSelector('.inbox .proposal-card');
    await page.click('.inbox .proposal-card button.approve');
    await page.waitForFunction(() => document.querySelectorAll('.audit .entry').length === 2);
    expect(await page.locator('.audit .entry.human').textContent()).toContain('Lumen Labs');
    expect(await page.locator('.audit .entry.agent').textContent()).toContain('Acme Corp');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
