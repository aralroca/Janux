import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type Browser } from 'playwright';
import { isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * Elicitation, end to end, over a real socket — and the compatibility promise
 * that comes with it.
 *
 * Two clients drive the same endpoint here, on purpose:
 *
 * 1. The **official MCP SDK**, unmodified, as any third party would use it. It
 *    negotiates `2025-11-25` — no shipping client speaks `2026-07-28` yet — so
 *    it exercises the legacy era, which is exactly the thing that must not have
 *    moved. If dual-era ever breaks, it breaks here first.
 * 2. A **modern-era client**, speaking `2026-07-28` on the wire, to walk the
 *    multi round-trip: `input_required`, a human in a real browser approving on
 *    the page the elicitation pointed at, then the retry that collects it.
 *
 * The human half is a real Chromium clicking a real button, because that page
 * is the whole reason `url` mode was chosen over `form`.
 */

const APP = appRoot('examples/with-mcp-url');
const BUILT = isBuilt(APP);
const TOKEN = 'demo-agent-token';
const MODERN = '2026-07-28';
const META = 'io.modelcontextprotocol/';

let base = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  const server = await startTestServer(APP);

  base = server.url;
  stop = server.stop;
}, TIMEOUT);

// The browser `launchBrowser()` hands out is shared by every e2e file in the
// process, so it is not this file's to close — only the pages it opened are.
afterAll(() => {
  stop?.();
});

/** One modern-era JSON-RPC POST, with the mirrored headers the gate insists on. */
async function modern(method: string, params: Record<string, unknown>, id = 1): Promise<any> {
  const name = method === 'tools/call' ? String(params.name) : undefined;
  const res = await fetch(`${base}/_janux/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
      'mcp-protocol-version': MODERN,
      'mcp-method': method,
      ...(name ? { 'mcp-name': name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          [`${META}protocolVersion`]: MODERN,
          [`${META}clientInfo`]: { name: 'e2e', version: '1' },
          [`${META}clientCapabilities`]: { elicitation: { url: {} } },
        },
      },
    }),
  });

  return (await res.json()).result;
}

/**
 * Its own incident, never a seeded one: the board is module state shared by
 * every e2e file in this process, and a test that resolves what another test
 * asserts is open would fail whichever ran second.
 */
async function freshIncident(): Promise<number> {
  const reported = await modern('tools/call', {
    name: 'incidents.report',
    arguments: { title: 'Elicitation e2e probe', severity: 'low' },
  });

  return JSON.parse(reported.content[0].text).id;
}

const resolveIncident = (id: number, extra: Record<string, unknown> = {}) =>
  modern('tools/call', { name: 'incidents.resolve', arguments: { id }, ...extra });

describe.skipIf(!BUILT)('examples/with-mcp-url — the older era, driven by the official SDK', () => {
  const connect = async () => {
    const client = new Client({ name: 'sdk-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/_janux/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    });

    await client.connect(transport);

    return client;
  };

  it('connects, and is told only what its era can use', async () => {
    const client = await connect();

    expect(client.getServerVersion()?.name).toBe('janux-app');
    // `subscribe` belongs to `subscriptions/listen`, which is a 2026-07-28
    // method. Advertising it here would promise this client something the
    // legacy handshake has no way to ask for.
    expect(client.getServerCapabilities()?.resources).toEqual({});
    await client.close();
  }, TIMEOUT);

  it('lists the app\'s tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['incidents.list', 'incidents.report', 'incidents.resolve']);
    await client.close();
  }, TIMEOUT);

  it('still gets the pre-elicitation answer for a confirm tool — nothing moved under it', async () => {
    const client = await connect();
    const result: any = await client.callTool({ name: 'incidents.resolve', arguments: { id: 1 } });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.status).toBe('proposal');
    expect(result.isError).toBeFalsy();
    await client.close();
  }, TIMEOUT);

  it('reads a page as a resource', async () => {
    const client = await connect();
    const { contents } = await client.readResource({ uri: 'janux://page/' });

    expect(String(contents[0]?.text)).toContain('#');
    await client.close();
  }, TIMEOUT);
});

describe.skipIf(!BUILT)('examples/with-mcp-url — elicitation, with a human in a real browser', () => {
  it('parks, waits for a person, and hands the result to the retry', async () => {
    const id = await freshIncident();
    const parked = await resolveIncident(id);
    const request = Object.values(parked.inputRequests)[0] as any;

    expect(parked.resultType).toBe('input_required');
    expect(request.params.mode).toBe('url');

    // Still waiting: the same question, the same state.
    const again = await resolveIncident(id, {
      requestState: parked.requestState,
      inputResponses: { approval: { action: 'accept' } },
    });

    expect(again.resultType).toBe('input_required');

    // The human half — a real browser, on the URL the elicitation handed out.
    browser ??= await launchBrowser();
    const { page } = await openPage(browser);

    await page.goto(request.params.url);
    await page.waitForSelector('button.approve');
    expect(await page.textContent('body')).toContain('incidents.resolve');
    await page.click('button.approve');
    await page.waitForSelector('h1');
    expect(await page.textContent('h1')).toContain('Approved');

    const collected = await resolveIncident(id, {
      requestState: parked.requestState,
      inputResponses: { approval: { action: 'accept' } },
    });

    expect(collected.resultType).toBe('complete');
    expect(collected.isError).toBeFalsy();
    expect(collected.content[0].text).toContain('resolved');
    await page.close();
  }, TIMEOUT);

  it('streams a resource update when the page behind it is revalidated', async () => {
    const res = await fetch(`${base}/_janux/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'mcp-protocol-version': MODERN,
        'mcp-method': 'subscriptions/listen',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'subscriptions/listen',
        params: {
          notifications: { resourceSubscriptions: ['janux://page/'] },
          _meta: { [`${META}protocolVersion`]: MODERN },
        },
      }),
    });

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);

    expect(JSON.parse(first.replace(/^data: /, '').trim()).method).toBe('notifications/subscriptions/acknowledged');
    await reader.cancel();
  }, TIMEOUT);
});
