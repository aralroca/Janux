import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { bool, int, schema } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from './boot';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const rowDetach = mock(() => {});
const parentRenders = mock(() => {});

const row = component({
  name: 'row',
  state: schema({ v: int() }),
  lifecycle: { detach: rowDetach },
  intents: {
    bump: intent({ run: ({ state }) => (state.v += 1) }),
  },
  view: ({ state, intents }: any) =>
    jsx('div', {
      children: [
        jsx('output', { class: 'row-v', children: `v=${state.v}` }),
        jsx('button', { class: 'row-btn', onClick: intents.bump, children: '+' }),
      ],
    }),
});

const panel = component({
  name: 'panel',
  state: schema({ open: bool().default(true), warn: bool(), n: int() }),
  intents: {
    toggle: intent({ run: ({ state }) => (state.open = !state.open) }),
    inc: intent({ run: ({ state }) => (state.n += 1) }),
    warnOn: intent({ run: ({ state }) => (state.warn = true) }),
  },
  view: ({ state, intents }: any) => {
    parentRenders();

    return jsx('section', {
      children: [
        state.warn ? jsx('p', { class: 'warn', children: '!' }) : null,
        jsx('output', { class: 'panel-n', children: `n=${state.n}` }),
        jsx('button', { class: 'panel-inc', onClick: intents.inc, children: '+' }),
        jsx('button', { class: 'panel-toggle', onClick: intents.toggle, children: 'toggle' }),
        state.open ? jsx(row as any, {}) : null,
      ],
    });
  },
});

async function serveAndBoot(initialRow = { v: 3 }): Promise<JanuxClient> {
  const { html, snapshots } = await renderToString(jsx(panel as any, {}), {
    initialState: { 'ui://row#panel.default.1': initialRow },
  });
  const scripts = snapshots
    .map(
      (snap) =>
        `<script type="application/janux+state" data-uri="${snap.uri}">${JSON.stringify({ state: snap.state, sources: snap.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = html + scripts;
  parentRenders.mockClear();
  rowDetach.mockClear();

  return boot({ defs: [panel, row] });
}

describe('nested islands', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('SSR renders the nested island with a parent-namespaced id and its own snapshot', async () => {
    const { html, snapshots } = await renderToString(jsx(panel as any, {}), {
      initialState: { 'ui://row#panel.default.1': { v: 3 } },
    });

    expect(html).toContain('data-jx="row#panel.default.1"');
    expect(snapshots.map((snap) => snap.uri)).toContain('ui://row#panel.default.1');
    expect(html).toContain('v=3');
  });

  it('resumes the nested island alone on direct interaction — parent code never runs', async () => {
    const client = await serveAndBoot();

    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();
    expect(document.querySelector('.row-v')!.textContent).toBe('v=4');
    expect(parentRenders).toHaveBeenCalledTimes(0);
  });

  it('parent re-renders treat a live child as an opaque boundary (same DOM, same state)', async () => {
    const client = await serveAndBoot();

    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();
    const liveRow = document.querySelector('.row-v');

    (document.querySelector('.panel-inc') as HTMLElement).click();
    await client.settled();
    expect(document.querySelector('.panel-n')!.textContent).toBe('n=1');
    expect(document.querySelector('.row-v')).toBe(liveRow);
    expect(document.querySelector('.row-v')!.textContent).toBe('v=4');
  });

  it('removing the child from the view disposes it; re-adding mounts a fresh client-side instance', async () => {
    const client = await serveAndBoot();

    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();

    (document.querySelector('.panel-toggle') as HTMLElement).click();
    await client.settled();
    expect(document.querySelector('.row-v')).toBeNull();
    expect(rowDetach).toHaveBeenCalledTimes(1);

    (document.querySelector('.panel-toggle') as HTMLElement).click();
    await client.settled();
    // Fresh island born on the client: default state, no snapshot to resume.
    expect(document.querySelector('.row-v')!.textContent).toBe('v=0');
    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();
    expect(document.querySelector('.row-v')!.textContent).toBe('v=1');
  });

  it('disposing the parent cascades to mounted descendants', async () => {
    const client = await serveAndBoot();

    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();
    const instance: any = await client.mount('panel#default');

    await instance.dispose();
    expect(rowDetach).toHaveBeenCalledTimes(1);
  });

  it('a live child survives its index shifting inside the parent (keyed island morph)', async () => {
    const client = await serveAndBoot();

    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();
    const liveRow = document.querySelector('.row-v');

    // warnOn inserts a <p> BEFORE the child island — its index shifts by one.
    await client.call('panel.warnOn');
    await client.settled();
    expect(document.querySelector('.warn')).not.toBeNull();
    expect(document.querySelector('.row-v')).toBe(liveRow);
    expect(document.querySelector('.row-v')!.textContent).toBe('v=4');
    expect(rowDetach).toHaveBeenCalledTimes(0);
  });

  it('concurrent mounts of the same island share one instance', async () => {
    const client = await serveAndBoot();
    const [first, second] = await Promise.all([
      client.mount('panel#default'),
      client.mount('panel#default'),
    ]);

    expect(first).toBe(second);
  });

  it('dispose is idempotent — lifecycle.detach runs exactly once', async () => {
    const client = await serveAndBoot();

    (document.querySelector('.row-btn') as HTMLElement).click();
    await client.settled();
    const instance: any = await client.mount('panel#default');

    await Promise.all([instance.dispose(), instance.dispose()]);
    await instance.dispose();
    expect(rowDetach).toHaveBeenCalledTimes(1);
  });

  it('exposes the nested island to agents as a live resource', async () => {
    const client = await serveAndBoot();
    const resource: any = await client.read('ui://row#panel.default.1');

    expect(resource.state.v).toBe(3);
  });
});
