import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { gotoSettled, isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * Two Janux apps, on two origins, talking to each other over A2A — with a
 * `confirm` guard in the middle.
 *
 * `examples/a2a-buyer` discovers `examples/a2a-supplier` through its
 * `/.well-known/agent-card.json` and hires it. The quote comes straight back;
 * the shipment does not, because the supplier's guard parks it for a human on
 * the supplier's own site. This suite drives the whole loop, including the
 * browser end of the approval — the part no unit test can assert, since it is a
 * real click on a page the framework resumed.
 */

const SUPPLIER = appRoot('examples/a2a-supplier');
const BUYER = appRoot('examples/a2a-buyer');
const BUILT = isBuilt(SUPPLIER) && isBuilt(BUYER);

let supplier = '';
let buyer = '';
let stopSupplier: (() => void) | undefined;
let stopBuyer: (() => void) | undefined;
let browser: Browser | undefined;

/** One JSON-RPC call to the supplier's A2A endpoint, as an outside client makes it. */
async function rpc(method: string, params: unknown): Promise<any> {
  const response = await fetch(`${supplier}/_janux/a2a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  return response.json();
}

const sendSkill = (skill: string, input: unknown) =>
  rpc('SendMessage', { message: { role: 'ROLE_USER', messageId: crypto.randomUUID(), parts: [{ data: { skill, input } }] } });

/** One call to a buyer `api()` tool, the way its own page calls it. */
async function buyerApi(name: string, input: unknown): Promise<any> {
  const response = await fetch(`${buyer}/_janux/api/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: buyer, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(input),
  });

  return response.json();
}

const proposalOf = (task: any): string => task.status.message.parts.find((part: any) => part.data)!.data.proposal;

beforeAll(async () => {
  const supplierServer = await startTestServer(SUPPLIER);

  supplier = supplierServer.url;
  stopSupplier = supplierServer.stop;
  // The buyer resolves the supplier from the environment, so the two apps are
  // wired the way a deployment wires them rather than through a test-only seam.
  process.env.SUPPLIER_URL = supplier;
  const buyerServer = await startTestServer(BUYER);

  buyer = buyerServer.url;
  stopBuyer = buyerServer.stop;
});

afterAll(() => {
  // The browser is deliberately left open: `launchBrowser` hands out one for the
  // whole process, so closing it here takes down every suite that runs after
  // this one — and this file sorts first. Pages are closed, the browser is not.
  // Reverse order: the app root each server published is process-global.
  stopBuyer?.();
  stopSupplier?.();
  delete process.env.SUPPLIER_URL;
});

describe('a2a: an outside client discovers and hires the supplier', () => {
  it('serves an agent card that names the endpoint and the skills', async () => {
    const card = await (await fetch(`${supplier}/.well-known/agent-card.json`)).json();

    expect(card.name).toBe('Parts Supplier');
    expect(card.supportedInterfaces[0].url).toBe(`${supplier}/_janux/a2a`);
    expect(card.skills.map((skill: { id: string }) => skill.id)).toEqual([
      'supplier.catalog',
      'supplier.quote',
      'supplier.ship',
    ]);
  });

  it('advertises the guard that needs a human before the tool is ever called', async () => {
    const card = await (await fetch(`${supplier}/.well-known/agent-card.json`)).json();
    const ship = card.skills.find((skill: { id: string }) => skill.id === 'supplier.ship');

    expect(ship.tags).toEqual(['tool', 'confirm']);
  });

  it('runs an auto skill and answers with a completed task', async () => {
    const { result } = await sendSkill('supplier.quote', { sku: 'MUG', units: 10 });

    expect(result.task.status.state).toBe('TASK_STATE_COMPLETED');
    expect(result.task.artifacts[0].parts[0].data).toEqual({ sku: 'MUG', units: 10, unitPrice: 9, total: 90 });
  });

  it('parks a guarded skill as input-required and ships nothing', async () => {
    const before = await (await fetch(`${supplier}/`)).text();
    const { result } = await sendSkill('supplier.ship', { sku: 'CAP', units: 1 });

    expect(result.task.status.state).toBe('TASK_STATE_INPUT_REQUIRED');
    expect(result.task.artifacts).toBeUndefined();
    expect(before).toContain('Nothing has shipped');
  });

  it('completes the parked task once a human settles it, and not before', async () => {
    const parked = (await sendSkill('supplier.ship', { sku: 'TEE', units: 2 })).result.task;

    expect((await rpc('GetTask', { id: parked.id })).result.status.state).toBe('TASK_STATE_INPUT_REQUIRED');
    await fetch(`${supplier}/_janux/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: supplier, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ id: proposalOf(parked) }),
    });
    const settled = (await rpc('GetTask', { id: parked.id })).result;

    expect(settled.status.state).toBe('TASK_STATE_COMPLETED');
    expect(settled.artifacts[0].parts[0].data).toMatchObject({ sku: 'TEE', units: 2 });
  });
});

describe('a2a: the buyer app hires the supplier through its card', () => {
  it('reads the supplier card rather than a hard-coded tool list', async () => {
    const { ok, result } = await buyerApi('purchasing.supplierCard', {});

    expect(ok).toBe(true);
    expect(result.name).toBe('Parts Supplier');
    expect(result.skills.map((skill: { id: string }) => skill.id)).toContain('supplier.ship');
  });

  it('gets a quote in one round trip', async () => {
    const { result } = await buyerApi('purchasing.priceCheck', { sku: 'MUG', units: 3 });

    expect(result).toEqual({ total: 27, unitPrice: 9 });
  });

  it('is told where a human has to decide, and cannot decide it itself', async () => {
    const { result } = await buyerApi('purchasing.order', { sku: 'MUG', units: 4 });

    expect(result.state).toBe('awaiting-approval');
    expect(result.approveAt.startsWith(`${supplier}/approve/`)).toBe(true);
    expect((await buyerApi('purchasing.orderStatus', { taskId: result.taskId })).result.state).toBe(
      'TASK_STATE_INPUT_REQUIRED',
    );
  });
});

describe.if(BUILT)('a2a: the human in the middle, in a real browser', () => {
  it(
    'a click on the supplier approves the buyer’s order, and the buyer sees it complete',
    async () => {
      browser ??= await launchBrowser();
      const { page, errors } = await openPage(browser);

      await gotoSettled(page, buyer);
      await page.click('button.order');
      await page.waitForSelector('.parked');
      expect(await page.textContent('.task-state')).toBe('TASK_STATE_INPUT_REQUIRED');

      const [desk] = await Promise.all([page.context().waitForEvent('page'), page.click('a.approve-link')]);

      await desk.waitForLoadState('networkidle');
      await desk.click('button.approve');
      await desk.waitForSelector('.ok');
      expect(await desk.textContent('.ok')).toContain('Shipped');

      await page.bringToFront();
      await page.click('button.refresh');
      await page.waitForFunction(() => document.querySelector('.task-state')?.textContent?.includes('COMPLETED'));
      expect(errors).toEqual([]);
      await page.close();
      await desk.close();
    },
    TIMEOUT,
  );
});
