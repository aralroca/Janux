import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runScriptsWhileStreaming } from './scripts';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/' }));
afterAll(() => GlobalRegistrator.unregister());

/** A script the diff inserted: same shape, inert. */
function insertInert(attributes: Record<string, string>, code = ''): HTMLScriptElement {
  const script = document.createElement('script');

  Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
  script.textContent = code;
  document.body.appendChild(script);

  return script;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runScriptsWhileStreaming', () => {
  it('re-creates a new script in place, marked so it is not processed twice', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const stop = runScriptsWhileStreaming();

    insertInert({ id: 'fresh', type: 'module' }, 'globalThis.__x = 1;');
    await settle();
    const script = document.querySelector('script#fresh') as HTMLScriptElement;

    expect(script.getAttribute('type')).toBe('module');
    expect(script.dataset.jxRan).toBe('');
    expect(document.querySelectorAll('script#fresh')).toHaveLength(1);
    stop();
  });

  /** The identity rule: src, then id, then the code — a page's theme snippet is the same text on every page. */
  it('leaves alone what the document already runs', async () => {
    document.head.innerHTML = '<script src="/client.js"></script><script>restoreTheme();</script>';
    document.body.innerHTML = '';
    const stop = runScriptsWhileStreaming();
    const bySrc = insertInert({ src: '/client.js' });
    const byText = insertInert({}, 'restoreTheme();');

    await settle();

    expect(bySrc.dataset.jxRan).toBeUndefined();
    expect(byText.dataset.jxRan).toBeUndefined();
    stop();
  });

  it('never executes the data blocks a page carries', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const stop = runScriptsWhileStreaming();
    const snapshot = insertInert({ type: 'application/janux+state', 'data-uri': 'ui://cart' }, '{"state":{}}');

    await settle();

    expect(snapshot.dataset.jxRan).toBeUndefined();
    stop();
  });

  /**
   * A whole-document diff can replace the entire <body> in one node, and then
   * every script the page carries arrives as a descendant. Measured in Chrome:
   * without this, a page's own script runs zero times.
   */
  it('finds the scripts inside a subtree the diff replaced wholesale', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const stop = runScriptsWhileStreaming();
    const body = document.createElement('div');

    body.innerHTML = '<h1>B</h1><script id="embed">globalThis.__z = 1;</scr' + 'ipt>';
    document.body.appendChild(body);
    await settle();

    expect((document.querySelector('script#embed') as HTMLScriptElement).dataset.jxRan).toBe('');
    stop();
  });

  it('flushes what is still queued when it stops', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const stop = runScriptsWhileStreaming();
    const late = insertInert({ id: 'last-chunk' }, 'globalThis.__w = 1;');

    // No await: the records are still in the observer's queue, which is exactly
    // where the last chunk's scripts sit when the diff resolves.
    stop();

    expect(late.isConnected).toBe(false);
    expect((document.querySelector('script#last-chunk') as HTMLScriptElement).dataset.jxRan).toBe('');
  });

  it('stops when told to', async () => {
    document.body.innerHTML = '';
    runScriptsWhileStreaming()();
    const ignored = insertInert({ id: 'after-stop' }, 'globalThis.__y = 1;');

    await settle();

    expect(ignored.dataset.jxRan).toBeUndefined();
  });
});
