import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, openPage as newPage, serveBuilt, ssrApp } from './support/app';

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
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
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
  browser = await launchBrowser();
});

afterAll(() => {
  stop?.();
});

const openPage = () => newPage(browser!);

const statusOf = (page: Page, id: string) => page.locator(`[data-payment="${id}"] .status`).textContent();

const ledgerLength = (page: Page) =>
  page.evaluate(async () => {
    const response = await fetch('/_janux/api/payments.ledger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    return ((await response.json()) as any).result.transfers.length;
  });

const sendExample = (page: Page) => page.locator('.tool-row:has-text("payments.send") code.example').textContent();

/** Parks an agent proposal on `payments.send` from the panel, exactly as the user does. */
const callAsAgent = async (page: Page, tool: string) => {
  await page.waitForSelector(`.tool-row:has-text("${tool}") button`);
  await page.click(`.tool-row:has-text("${tool}") button`);
};

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

  it('advertises payloads that are runnable as shown: real defaults, and only ids still pending', async () => {
    const manifest: any = await (await get('/_janux/manifest?path=/')).json();
    const propertiesOf = (name: string) => manifest.tools.find((tool: any) => tool.name === name).input.properties;

    // A default is what the tool means in general…
    expect(propertiesOf('payments.draft')).toEqual({
      to: { type: 'string', minLength: 1, default: 'Nimbus Cloud' },
      amountCents: { type: 'integer', format: 'money-minor-units', default: 990 },
    });
    expect(propertiesOf('api.payments.transfer')).toEqual({
      to: { type: 'string', minLength: 1, default: 'Orbit Freight' },
      amountCents: { type: 'integer', format: 'money-minor-units', default: 24500 },
    });
    // …an `options()` enum is what it accepts right now: both drafts are pending.
    expect(propertiesOf('payments.send').id.enum).toEqual(['pay_acme', 'pay_lumen']);
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

  it('a server api() tool called through the bridge parks in the inbox; Approve executes it server-side', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("api.payments.transfer") button');
    const before = await ledgerLength(page);

    await page.click('.tool-row:has-text("api.payments.transfer") button');
    await page.waitForSelector('.inbox .proposal-card');
    // Parked server-side, mirrored client-side: nothing hit the ledger yet.
    expect(await ledgerLength(page)).toBe(before);

    await page.click('.inbox .proposal-card button.approve');
    await page.waitForFunction(() => document.querySelectorAll('.inbox .proposal-card').length === 0);
    expect(await ledgerLength(page)).toBe(before + 1);
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

  it('every payload the panel advertises runs as shown, for all four tools', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("api.payments.ledger") button');
    const names = await page.locator('.tool-row > code:not(.example)').allTextContents();

    expect(names.slice().sort()).toEqual([
      'api.payments.ledger',
      'api.payments.transfer',
      'payments.draft',
      'payments.send',
    ]);
    for (const name of names) {
      await callAsAgent(page, name);
      await page.waitForFunction((tool) => {
        const last = document.querySelector('.last-result')?.textContent ?? '';

        return last.length > 0 && (tool.includes('send') || tool.includes('transfer') ? last.includes('proposal') : true);
      }, name);
      expect(await page.locator('.last-result').textContent()).not.toContain('rror');
    }
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the payload shown for send follows the queue: a sent payment leaves the advertised ids', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("payments.send") code.example');
    expect(await sendExample(page)).toBe('{"id":"pay_acme"}');

    await page.click('[data-payment="pay_acme"] button.send');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_acme"] .status')?.textContent === 'sent');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.tool-row')].some(
        (row) =>
          row.querySelector('code')?.textContent === 'payments.send' &&
          row.querySelector('code.example')?.textContent === '{"id":"pay_lumen"}',
      ),
    );
    expect(await sendExample(page)).toBe('{"id":"pay_lumen"}');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('each new draft names a different vendor, and the button says which one', async () => {
    const { page, errors } = await openPage();
    const label = () => page.locator('button.new-draft').textContent();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('button.new-draft');
    expect(await label()).toContain('9.90€ to Nimbus Cloud');

    await page.click('button.new-draft');
    await page.waitForFunction(() => document.querySelectorAll('.queue li').length === 3);
    expect(await label()).toContain('245.00€ to Orbit Freight');

    await page.click('button.new-draft');
    await page.waitForFunction(() => document.querySelectorAll('.queue li').length === 4);
    expect(await label()).toContain('78.00€ to Vela Design');
    expect(await page.locator('.queue .to').allTextContents()).toEqual([
      'Acme Corp',
      'Lumen Labs',
      'Nimbus Cloud',
      'Orbit Freight',
    ]);
    // Drafting is auditable too, and it is the human who did it.
    expect(await page.locator('.audit .entry.human').count()).toBe(2);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('approving a payment that already went out says so, and moves no money twice', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await callAsAgent(page, 'payments.send');
    await page.waitForSelector('.inbox .proposal-card');
    const before = await ledgerLength(page);

    // The world moves on while the proposal waits: the human sends it by hand.
    await page.click('[data-payment="pay_acme"] button.send');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_acme"] .status')?.textContent === 'sent');
    await page.click('.inbox .proposal-card button.approve');
    await page.waitForSelector('.inbox .approval-failed');

    expect(await page.locator('.inbox .approval-failed').textContent()).toContain('already sent');
    expect(await page.locator('.inbox .proposal-card').count()).toBe(0);
    expect(await page.locator('.audit .entry.failed').textContent()).toContain('already sent');
    expect(await ledgerLength(page)).toBe(before + 1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('an approved proposal is spent: replaying the approval runs nothing', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await callAsAgent(page, 'payments.send');
    await page.waitForSelector('.inbox .proposal-card');
    const id = await page.evaluate(() => [...(window as any).janux.proposals.keys()][0] as string);
    const before = await ledgerLength(page);

    await page.click('.inbox .proposal-card button.approve');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_acme"] .status')?.textContent === 'sent');
    const after = await ledgerLength(page);

    // The approval is the execution: exactly one transfer, and only one.
    expect(after).toBe(before + 1);
    const replay = await page.evaluate(
      (proposalId) => (window as any).janux.approve(proposalId).then(() => 'ran again', (error: unknown) => String(error)),
      id,
    );

    expect(replay).toContain('unknown proposal');
    expect(await ledgerLength(page)).toBe(after);
    expect(await page.locator('.audit .entry').count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('re-rendering after an intent never blanks the lists it touches', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('button.new-draft');
    await page.evaluate(() => {
      const seen = { rows: 2 };

      (window as any).__seen = seen;
      new MutationObserver(() => {
        seen.rows = Math.min(seen.rows, document.querySelectorAll('.queue li').length);
      }).observe(document.querySelector('.desk')!, { childList: true, subtree: true });
    });

    await page.click('button.new-draft');
    await page.waitForFunction(() => document.querySelectorAll('.queue li').length === 3);
    await page.click('[data-payment="pay_lumen"] button.send');
    await page.waitForFunction(() => document.querySelector('[data-payment="pay_lumen"] .status')?.textContent === 'sent');

    expect(await page.evaluate(() => (window as any).__seen.rows)).toBe(2);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
