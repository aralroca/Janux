import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { publishJanuxError } from './error-channel';
import { installDevOverlay } from './overlay';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:4321/shop' }));
afterAll(() => GlobalRegistrator.unregister());

const CHAIN = {
  kind: 'intent' as const,
  component: 'cart',
  name: 'checkout',
  island: 'ui://cart#default',
  origin: 'human' as const,
  guard: 'auto' as const,
};

const ROUTE = { path: '/shop', pattern: '/shop', file: 'src/routes/shop.tsx', layouts: ['src/routes/_layout.tsx'], params: {} };

let uninstall: () => void;
let logged: unknown[];

function overlayText(): string {
  return document.querySelector('janux-dev-overlay')?.shadowRoot?.textContent ?? '';
}

/** Lets the route fetch settle so the rendered panel is the final one. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  logged = [];
  console.error = mock((...args: unknown[]) => logged.push(args[0]));
  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify(ROUTE), { headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
  uninstall = installDevOverlay();
});

afterEach(() => {
  uninstall();
});

describe('the dev error overlay', () => {
  it('renders the Janux chain of a published failure', async () => {
    publishJanuxError(new Error('payment gateway is down'), CHAIN);
    await settle();

    const text = overlayText();

    expect(text).toContain('payment gateway is down');
    expect(text).toContain('ui://cart#default');
    expect(text).toContain('cart.checkout');
    expect(text).toContain('auto');
    expect(text).toContain('human');
  });

  it('asks the dev server which route and layouts were in play, and shows them', async () => {
    publishJanuxError(new Error('boom'), CHAIN);
    await settle();

    expect(globalThis.fetch).toHaveBeenCalledWith('/_janux/dev/route?path=%2Fshop');
    expect(overlayText()).toContain('src/routes/_layout.tsx');
  });

  /**
   * The overlay watches; it must never become the only place the error exists.
   * Janux swallows a failed intent into a `janux:error` DOM event, so without
   * this line the console would stay empty and the stack unreachable.
   */
  it('always logs the original error object to the console', async () => {
    const boom = new Error('payment gateway is down');

    publishJanuxError(boom, CHAIN);
    await settle();

    expect(logged).toContain(boom);
  });

  it('survives a dev server that cannot answer, showing the chain it already has', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('dev server gone');
    }) as unknown as typeof fetch;
    publishJanuxError(new Error('boom'), CHAIN);
    await settle();

    expect(overlayText()).toContain('cart.checkout');
  });

  it('folds repeat failures into one panel', async () => {
    publishJanuxError(new Error('first'), CHAIN);
    publishJanuxError(new Error('second'), CHAIN);
    publishJanuxError(new Error('third'), CHAIN);
    await settle();

    expect(document.querySelectorAll('janux-dev-overlay')).toHaveLength(1);
    expect(overlayText()).toContain('third');
    expect(overlayText()).toContain('+2 more');
  });

  it('dismisses on Escape and on the close button', async () => {
    publishJanuxError(new Error('boom'), CHAIN);
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('janux-dev-overlay')).toBeNull();

    publishJanuxError(new Error('again'), CHAIN);
    await settle();
    (document.querySelector('janux-dev-overlay')!.shadowRoot!.querySelector('[data-jx-close]') as HTMLElement).click();

    expect(document.querySelector('janux-dev-overlay')).toBeNull();
  });

  /** An error from outside the pipeline has no chain, and the overlay says so rather than inventing one. */
  it('reports an uncaught error with no Janux chain, honestly', async () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('undefined is not a function') }));
    await settle();

    const text = overlayText();

    expect(text).toContain('undefined is not a function');
    expect(text).toContain('did not come through an intent, effect or source');
  });

  it('leaves the document clean once uninstalled', async () => {
    publishJanuxError(new Error('boom'), CHAIN);
    await settle();
    uninstall();

    expect(document.querySelector('janux-dev-overlay')).toBeNull();

    publishJanuxError(new Error('after'), CHAIN);
    await settle();

    expect(document.querySelector('janux-dev-overlay')).toBeNull();
  });
});
