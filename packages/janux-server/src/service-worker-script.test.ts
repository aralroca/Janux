import { describe, expect, it } from 'bun:test';
import {
  bootServiceWorker,
  dropStaleServiceWorkerCaches,
  reclaimServiceWorkerScript,
  serviceWorkerScript,
  unregisterStaleServiceWorker,
  type PageScope,
} from './service-worker-script';

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
  const calls = { registered: [] as string[], reloads: 0, updates: 0, unregistered: 0 };
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

/**
 * Lets a chain of already-resolved promises run to completion. A macrotask
 * rather than a counted number of ticks: the chain's length is an implementation
 * detail, and a count that happens to fit today is a test that breaks on the
 * next `.then`.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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

/**
 * `janux dev` never registers a worker — but it very often runs on the port a
 * `janux start` used an hour ago, and a worker is scoped to the origin, not to
 * the process. So the dev page opens under a worker from a build that no longer
 * exists: it answers `/styles.css` from a cache Vite is not serving, and the
 * developer sees an unstyled page with no obvious cause.
 *
 * Dev therefore reclaims the origin instead of merely declining to claim it.
 * Nothing happens when no worker is controlling, which is almost every session.
 */
function controlledPage(controller: object | null) {
  const { page, calls } = fakePage(controller);
  const registrations = [{ unregister: async () => { calls.unregistered += 1; } }];
  const caches = new Map<string, boolean>([['janux-v1', true], ['app-images', true]]);

  (page.navigator.serviceWorker as any).getRegistrations = async () => registrations;
  (page as any).caches = {
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  };

  return { page, calls, caches };
}

describe('reclaiming the origin in dev', () => {
  it('unregisters a worker left behind by a production run, and reloads once', async () => {
    const { page, calls } = controlledPage({});

    unregisterStaleServiceWorker(page);
    await settle();

    expect(calls.unregistered).toBe(1);
    expect(calls.reloads).toBe(1);
  });

  it('does nothing at all when no worker is controlling the page', async () => {
    const { page, calls } = controlledPage(null);

    unregisterStaleServiceWorker(page);
    await settle();

    expect(calls.unregistered).toBe(0);
    expect(calls.reloads).toBe(0);
  });

  /**
   * The caches are swept on the load AFTER the unregistration, never in the
   * same breath: a worker that is still controlling the page keeps answering
   * and caching requests, so a delete issued alongside the reload races it and
   * loses — leaving a `janux-` cache refilled with the dev server's own URLs.
   */
  it("sweeps Janux's leftover caches once nothing is controlling the page", async () => {
    const { page, caches } = controlledPage(null);

    dropStaleServiceWorkerCaches(page);
    await settle();

    expect([...caches.keys()]).toEqual(['app-images']);
  });

  it('leaves the caches alone while the old worker is still in charge of them', async () => {
    const { page, caches } = controlledPage({});

    dropStaleServiceWorkerCaches(page);
    await settle();

    expect([...caches.keys()]).toEqual(['janux-v1', 'app-images']);
  });

  it('is emitted as a keyed, nonced script like everything else the shell writes', () => {
    const script = reclaimServiceWorkerScript('n0nce');

    expect(script).toContain('key="jx-sw-reclaim"');
    expect(script).toContain('nonce="n0nce"');
    expect(script).not.toMatch(/\b_[a-z_]+\(/);
  });
});
