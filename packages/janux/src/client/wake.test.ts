import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { component, intent, store } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, schema } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from './boot';
import { createInstance } from '../runtime/instance';
import { ensureStore, type MountContext } from './mount';
import { createClientRegistry } from './registry';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const readerRenders = mock(() => {});
const lonerRenders = mock(() => {});

const tally = store({
  name: 'tally',
  state: schema({ n: int() }),
  intents: {
    inc: intent({ run: ({ state }) => (state.n += 1) }),
  },
});

/** The mutator: writes the shared store, never touches the readers. */
const bumper = component({
  name: 'bumper',
  use: { tally },
  intents: {
    bump: intent({ run: ({ use }) => use.tally.intents.inc() }),
  },
  view: ({ intents }: any) => jsx('button', { onClick: intents.bump, children: '+1' }),
});

/** A pure reader with a conditional — the hydration-mismatch shape auto-wake must absorb. */
const badge = component({
  name: 'badge',
  use: { tally },
  view: ({ use }: any) => {
    readerRenders();

    return jsx('output', {
      children: use.tally.state.n > 0 ? `n=${use.tally.state.n}` : 'empty',
    });
  },
});

/** No `use` at all: a store write is none of its business. */
const loner = component({
  name: 'loner',
  state: schema({ k: int() }),
  view: () => {
    lonerRenders();

    return jsx('span', { children: 'loner' });
  },
});

async function serveAndBoot(): Promise<JanuxClient> {
  const page = jsx('div', { children: [jsx(bumper as any, {}), jsx(badge as any, {}), jsx(loner as any, {})] });
  const { html, snapshots } = await renderToString(page, { storeDefs: { tally } });
  const scripts = snapshots
    .map(
      (snapshot) =>
        `<script type="application/janux+state" data-uri="${snapshot.uri}">${JSON.stringify({ state: snapshot.state, sources: snapshot.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = html + scripts;
  readerRenders.mockClear();
  lonerRenders.mockClear();

  return boot({ defs: [tally, bumper, badge, loner] });
}

describe('store writes wake inert readers', () => {
  it('SSR stamps the island host with the store names it reads', async () => {
    const { html } = await renderToString(jsx(badge as any, {}), { storeDefs: { tally } });

    expect(html).toContain('data-jx="badge#default"');
    expect(html).toContain('data-jx-use="tally"');
  });

  it('runs zero reader code until the store is written', async () => {
    await serveAndBoot();

    expect(readerRenders).toHaveBeenCalledTimes(0);
    expect(document.querySelector('output')!.textContent).toBe('empty');
  });

  it('first store write resumes the inert reader and patches its flipped conditional', async () => {
    const client = await serveAndBoot();

    document.querySelector('button')!.click();
    await client.settled();
    expect(readerRenders.mock.calls.length).toBeGreaterThan(0);
    expect(document.querySelector('output')!.textContent).toBe('n=1');
  });

  it('reuses the SSR node when patching the woken reader (reconcile, not replace)', async () => {
    const client = await serveAndBoot();
    const ssrOutput = document.querySelector('output');

    document.querySelector('button')!.click();
    await client.settled();
    expect(document.querySelector('output')).toBe(ssrOutput);
  });

  it('leaves islands that do not use the store inert', async () => {
    const client = await serveAndBoot();

    document.querySelector('button')!.click();
    await client.settled();
    expect(lonerRenders).toHaveBeenCalledTimes(0);
  });

  it('wakes an agent-written store\'s readers too', async () => {
    const client = await serveAndBoot();

    await client.call('tally.inc');
    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('n=1');
  });

  it('late markup of a dirty store resumes on arrival instead of showing server state', async () => {
    const client = await serveAndBoot();

    // The badge streams in later (suspense tail): drop it from the initial page…
    document.querySelector('janux-island[data-jx="badge#default"]')!.remove();
    document.querySelector('button')!.click();
    await client.settled();
    // …then arrive with markup a server that never saw the write rendered.
    const { html } = await renderToString(jsx(badge as any, {}), { storeDefs: { tally } });

    document.body.insertAdjacentHTML('beforeend', html);
    expect(document.querySelector('output')!.textContent).toBe('empty');
    document.dispatchEvent(new CustomEvent('janux:unsuspense'));
    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('n=1');
  });

  it('a zombie write from a disposed store neither re-dirties it nor wakes readers', async () => {
    const registry = createClientRegistry();
    const mount = { registry, ctx: {}, inflight: new Set(), onProposal: () => {} } as unknown as MountContext;
    const zombie = await ensureStore(tally as any, mount);

    // The route sweep: the instance leaves the registry, then disposes — but an
    // in-flight intent (async-aware gate) can still land a write afterwards.
    registry.stores.delete('tally');
    registry.dirtyStores.delete('tally');
    await zombie.dispose();
    zombie.patch({ n: 9 });
    expect(registry.dirtyStores.has('tally')).toBe(false);

    // A live successor wakes normally.
    const successor = await ensureStore(tally as any, mount);

    successor.patch({ n: 1 });
    expect(registry.dirtyStores.has('tally')).toBe(true);
  });

  it('a patch that changes nothing fires no write — persist rehydration keeps readers lazy', () => {
    const writes = mock(() => {});
    const instance = createInstance(tally as any, { onStateWrite: writes });

    instance.patch({ n: 0 });
    expect(writes).toHaveBeenCalledTimes(0);
    instance.patch({ n: 2 });
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('steady-state writes after the first wake skip the document scan', async () => {
    const registry = createClientRegistry();
    const mount = { registry, ctx: {}, inflight: new Set(), onProposal: () => {} } as unknown as MountContext;
    const live = await ensureStore(tally as any, mount);
    const original = document.querySelectorAll.bind(document);
    const scans = mock(original);

    document.querySelectorAll = scans as any;
    try {
      live.patch({ n: 5 });
      live.patch({ n: 6 });
      live.patch({ n: 7 });
    } finally {
      document.querySelectorAll = original;
    }
    expect(registry.dirtyStores.has('tally')).toBe(true);
    expect(scans).toHaveBeenCalledTimes(1);
  });
});
