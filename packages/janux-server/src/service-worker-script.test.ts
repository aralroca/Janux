import { describe, expect, it } from 'bun:test';
import { bootServiceWorker, serviceWorkerScript, type PageScope } from './service-worker-script';

/**
 * The registration side of the contract, and specifically the reload.
 *
 * The worker calls `skipWaiting()`, so a new build activates while the old
 * page is still on screen — and then deletes the previous version's cache. A
 * page left running past that point holds markup naming hashed chunks that no
 * longer exist in the cache OR on the server, so its next lazy import fails.
 * The reload is not a nicety, it is the other half of `skipWaiting`.
 *
 * It must also fire exactly once and never on a first visit, or a brand-new
 * visitor meets a page that reloads itself for no reason.
 */

type Listeners = Map<string, () => void>;

function fakePage(controller: object | null) {
  const events: { page: Listeners; container: Listeners; document: Listeners } = {
    page: new Map(),
    container: new Map(),
    document: new Map(),
  };
  const calls = { registered: [] as string[], reloads: 0, updates: 0 };
  const registration = {
    update: () => {
      calls.updates += 1;

      return Promise.resolve();
    },
  };
  const page = {
    navigator: {
      serviceWorker: {
        controller,
        register: (url: string) => {
          calls.registered.push(url);

          return Promise.resolve(registration);
        },
        addEventListener: (type: string, handler: () => void) => events.container.set(type, handler),
      },
    },
    document: { hidden: false, addEventListener: (type: string, handler: () => void) => events.document.set(type, handler) },
    location: {
      reload: () => {
        calls.reloads += 1;
      },
    },
    addEventListener: (type: string, handler: () => void) => events.page.set(type, handler),
  } as unknown as PageScope;

  return { page, events, calls };
}

/** Fires `load` and lets the registration promise settle. */
async function load(events: { page: Listeners }): Promise<void> {
  events.page.get('load')?.();
  await Promise.resolve();
  await Promise.resolve();
}

describe('the emitted script tag', () => {
  it('is keyed and nonced like every other script the shell emits', () => {
    const script = serviceWorkerScript('/sw.js', 'n0nce');

    expect(script).toContain('key="jx-sw"');
    expect(script).toContain('nonce="n0nce"');
  });

  it('carries the worker URL as data that cannot close the element', () => {
    expect(serviceWorkerScript('/sw.js', undefined)).toContain('"/sw.js"');
    expect(serviceWorkerScript('/a</script><script>alert(1)</script>', undefined)).not.toContain('</script><script>');
  });

  /**
   * The function is shipped as source, so anything the compiler adds around it
   * — a renamed helper, an async shim — would be referenced in the page and
   * defined nowhere. Keeping it plain is what makes that impossible.
   */
  it('serialises to source that depends on nothing but its arguments', () => {
    const script = serviceWorkerScript('/sw.js', undefined);

    expect(script).not.toMatch(/\b_[a-z_]+\(/);
    expect(script).not.toContain('await ');
  });
});

describe('registration', () => {
  it('registers the worker once the page has loaded', async () => {
    const { page, events, calls } = fakePage(null);

    bootServiceWorker('/sw.js', page);

    expect(calls.registered).toEqual([]);
    await load(events);
    expect(calls.registered).toEqual(['/sw.js']);
  });

  it('does nothing where service workers are unavailable', () => {
    const page = { navigator: {}, addEventListener: () => {} } as unknown as PageScope;

    expect(() => bootServiceWorker('/sw.js', page)).not.toThrow();
  });
});

describe('taking over from a previous version', () => {
  it('reloads when a new worker takes control of a page an old one was serving', async () => {
    const { page, events, calls } = fakePage({});

    bootServiceWorker('/sw.js', page);
    await load(events);
    events.container.get('controllerchange')?.();

    expect(calls.reloads).toBe(1);
  });

  it('never reloads a first visit, where taking control is just the install finishing', async () => {
    const { page, events, calls } = fakePage(null);

    bootServiceWorker('/sw.js', page);
    await load(events);
    events.container.get('controllerchange')?.();

    expect(calls.reloads).toBe(0);
  });
});

describe('noticing a deploy that landed while the tab sat open', () => {
  it('re-checks the worker when the page becomes visible again', async () => {
    const { page, events, calls } = fakePage(null);

    bootServiceWorker('/sw.js', page);
    await load(events);
    events.document.get('visibilitychange')?.();

    expect(calls.updates).toBe(1);
  });

  it('does not re-check while the page is hidden', async () => {
    const { page, events, calls } = fakePage(null);

    bootServiceWorker('/sw.js', page);
    await load(events);
    (page.document as { hidden: boolean }).hidden = true;
    events.document.get('visibilitychange')?.();

    expect(calls.updates).toBe(0);
  });
});
