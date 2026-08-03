import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { isBuilt, launchBrowser, openPage as newPage } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { prodServerOptions } from '../packages/janux-cli/src/prod';
import { staticResponse } from '../packages/janux-cli/src/static-assets';

/**
 * What examples/realtime-chat exists to demonstrate: first-class WebSockets —
 * `src/ws.ts` is the whole server story, `janux dev`/`janux start` upgrade it
 * themselves — plus optimistic delivery (a send renders as `pending` before
 * the ~300ms server echo confirms it) and cursor replay (a reconnecting
 * client re-joins with its last confirmed seq and receives what it missed).
 * The boot below is byte-for-byte what `janux start` mounts.
 */

const ROOT = appRoot('examples/realtime-chat');
const BUILT = isBuilt(ROOT);

/** Exactly the `janux start` wiring: static assets, then `serve` (upgrade or fetch), plus the app's handlers. */
async function startChat() {
  const server = createJanuxServer(await prodServerOptions(ROOT));
  const staticDir = join(ROOT, 'dist/client');
  const bun = Bun.serve({
    port: 0,
    fetch: async (req, bunServer) => (await staticResponse(staticDir, req)) ?? server.serve(req, bunServer),
    websocket: server.websocket,
  });

  return { url: `http://localhost:${bun.port}`, stop: () => bun.stop(true) };
}

const openSocket = (url: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`${url.replace('http', 'ws')}/ws`);

    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', () => reject(new Error('socket failed to open')));
  });

const nextEvent = (socket: WebSocket, type: string): Promise<any> =>
  new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const parsed = JSON.parse(String(event.data));

      if (parsed.type !== type) return;
      socket.removeEventListener('message', onMessage);
      resolve(parsed);
    };

    socket.addEventListener('message', onMessage);
  });

const joinRoom = (socket: WebSocket, room: string, user: string, cursor = 0): Promise<any> => {
  const history = nextEvent(socket, 'history');

  socket.send(JSON.stringify({ type: 'join', room, user, cursor }));

  return history;
};

describe('examples/realtime-chat first-class websocket server', () => {
  beforeAll(() => {
    // The optimistic window is for humans; socket-level assertions want the echo now.
    process.env.CHAT_ECHO_DELAY_MS = '0';
  });

  afterAll(() => {
    delete process.env.CHAT_ECHO_DELAY_MS;
  });

  it('serves the Janux SSR page and upgrades /ws on the same port', async () => {
    const chat = await startChat();
    const home = await fetch(`${chat.url}/`);

    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<title>Janux — realtime chat</title>');
    expect((await fetch(`${chat.url}/_janux/manifest`)).status).toBe(200);
    expect((await fetch(`${chat.url}/ws`)).status).toBe(426);
    const socket = await openSocket(chat.url);

    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
    chat.stop();
  }, TIMEOUT);

  it('fans a message out to the room, tracks presence and replays history from a cursor', async () => {
    const chat = await startChat();
    const ana = await openSocket(chat.url);
    const bob = await openSocket(chat.url);

    await joinRoom(ana, 'general', 'ana');
    const presence = nextEvent(bob, 'presence');

    await joinRoom(bob, 'general', 'bob');
    expect((await presence).users.sort()).toEqual(['ana', 'bob']);

    const echoed = nextEvent(ana, 'message');
    const seen = nextEvent(bob, 'message');

    ana.send(JSON.stringify({ type: 'post', id: 'm1', text: 'hola sala' }));
    expect((await echoed).message).toMatchObject({ id: 'm1', user: 'ana', text: 'hola sala' });
    expect((await seen).message.text).toBe('hola sala');

    // A latecomer with cursor 0 gets the full log; with the last seq, nothing.
    const late = await openSocket(chat.url);
    const replay = await joinRoom(late, 'general', 'carol');

    expect(replay.messages.map((message: any) => message.text)).toEqual(['hola sala']);
    const caughtUp = await openSocket(chat.url);
    const empty = await joinRoom(caughtUp, 'general', 'dana', replay.messages[0].seq);

    expect(empty.messages).toEqual([]);
    [ana, bob, late, caughtUp].forEach((socket) => socket.close());
    chat.stop();
  }, TIMEOUT);
});

let BASE = '';
let chat: Awaited<ReturnType<typeof startChat>> | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  chat = await startChat();
  BASE = chat.url;
  browser = await launchBrowser();
});

afterAll(async () => {
  chat?.stop();
});

const openPage = () => newPage(browser!);

const texts = (page: Page) => page.locator('.messages .msg .text').allTextContents();
const waitForStatus = (page: Page, status: string) =>
  page.waitForSelector(`.status[data-status="${status}"]`, { timeout: 10_000 });
const waitForText = (page: Page, text: string) =>
  page.waitForFunction((expected) => document.body.textContent?.includes(expected), text, { timeout: 10_000 });

const openOnline = async (page: Page) => {
  await page.goto(`${BASE}/`);
  await waitForStatus(page, 'online');
};

const send = async (page: Page, text: string) => {
  await page.fill('.composer input', text);
  await page.click('.composer button[type="submit"]');
};

/** The user's literal flow: two tabs of ONE browser context (shared session). */
const openTabs = async (count: number) => {
  const context = await browser!.newContext();
  const errors: string[] = [];
  const pages = await Promise.all(Array.from({ length: count }, () => context.newPage()));

  pages.forEach((page) => page.on('pageerror', (error) => errors.push(String(error))));

  return { context, pages, errors };
};

describe.skipIf(!BUILT)('examples/realtime-chat in the browser', () => {
  it('two tabs of the same browser context exchange messages', async () => {
    const { context, pages, errors } = await openTabs(2);
    const [tabA, tabB] = pages;

    await openOnline(tabA!);
    await openOnline(tabB!);
    await tabA!.waitForFunction(() => document.querySelectorAll('.presence .user').length === 2, undefined, {
      timeout: 10_000,
    });

    await send(tabA!, 'tab to tab');
    await waitForText(tabB!, 'tab to tab');
    expect(await texts(tabB!)).toContain('tab to tab');
    expect(errors).toEqual([]);
    await context.close();
  }, TIMEOUT);

  it('a send paints instantly as pending, confirms on the echo and reaches a page in another context', async () => {
    const { page: alice, errors: aliceErrors } = await openPage();
    const { page: billy, errors: billyErrors } = await openPage();

    await openOnline(alice);
    await openOnline(billy);
    await alice.waitForFunction(() => document.querySelectorAll('.presence .user').length === 2, undefined, {
      timeout: 10_000,
    });

    await send(alice, 'first!');
    // Optimistic: `.pending` exists only before the delayed server echo — the
    // row is in the DOM without any confirmation having arrived.
    const pending = alice.locator('.msg.pending');

    await pending.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await pending.textContent()).toContain('first!');
    // The echo confirms it: pending clears and the seq lands on the row.
    await alice.waitForFunction(() => !document.querySelector('.msg.pending'), undefined, { timeout: 10_000 });
    expect(await alice.locator('.msg', { hasText: 'first!' }).getAttribute('data-seq')).not.toBe('0');
    await waitForText(billy, 'first!');
    expect(await texts(billy)).toContain('first!');
    expect(aliceErrors).toEqual([]);
    expect(billyErrors).toEqual([]);
    await alice.close();
    await billy.close();
  }, TIMEOUT);

  it('reconnects after a dropped socket and the cursor replay restores the full history', async () => {
    const { page: alice, errors: aliceErrors } = await openPage();
    const { page: billy, errors: billyErrors } = await openPage();

    await openOnline(alice);
    await openOnline(billy);
    // Move both to #random: an untouched room, so the log starts empty here.
    await alice.click('.rooms .room:has-text("#random")');
    await billy.click('.rooms .room:has-text("#random")');
    await alice.waitForFunction(() => document.querySelectorAll('.presence .user').length === 2, undefined, {
      timeout: 10_000,
    });

    await send(alice, 'before the drop');
    await waitForText(billy, 'before the drop');

    await alice.click('.drop');
    await waitForStatus(alice, 'offline');
    await send(billy, 'while you were away');
    await billy.waitForFunction(() => !document.querySelector('.msg.pending'), undefined, { timeout: 10_000 });

    // The retry loop re-joins with the last confirmed seq: the missed message
    // arrives via replay and everything older is still on screen.
    await waitForStatus(alice, 'online');
    await waitForText(alice, 'while you were away');
    expect(await texts(alice)).toEqual(['before the drop', 'while you were away']);
    expect(aliceErrors).toEqual([]);
    expect(billyErrors).toEqual([]);
    await alice.close();
    await billy.close();
  }, TIMEOUT);
});
