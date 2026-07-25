import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { component, intent, source, store } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, list, schema, str } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from './boot';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const viewRenders = mock(() => {});

const session = store({
  name: 'session',
  state: schema({ locale: str().default('en') }),
  intents: {
    setLocale: intent({
      input: schema({ locale: str() }),
      run: ({ state, input }) => (state.locale = input.locale),
    }),
  },
});

const counter = component({
  name: 'counter',
  state: schema({ n: int(), history: list({ v: int() }) }),
  use: { session },
  intents: {
    inc: intent({ run: ({ state }) => (state.n += 1) }),
    reset: intent({ guard: 'confirm', run: ({ state }) => (state.n = 0) }),
  },
  view: ({ state, intents }: any) => {
    viewRenders();

    return jsx('div', {
      children: [
        jsx('output', { children: `n=${state.n}` }),
        jsx('button', { on: intents.inc, children: '+1' }),
      ],
    });
  },
});

async function serveAndBoot(): Promise<JanuxClient> {
  const { html, snapshots } = await renderToString(jsx(counter as any, {}), {
    initialState: { 'ui://counter#default': { n: 5, history: [] } },
    storeDefs: { session },
  });
  const scripts = snapshots
    .map(
      (s) =>
        `<script type="application/janux+state" data-uri="${s.uri}">${JSON.stringify({ state: s.state, sources: s.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = html + scripts;
  viewRenders.mockClear();

  return boot({ defs: [counter, session] });
}

describe('client boot (resume without hydration)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('executes zero component code until first interaction', async () => {
    await serveAndBoot();

    expect(viewRenders).toHaveBeenCalledTimes(0);
    expect(document.querySelector('output')!.textContent).toBe('n=5');
  });

  it('resumes on delegated click: mounts from snapshot and runs the intent', async () => {
    const client = await serveAndBoot();

    document.querySelector('button')!.click();
    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('n=6');
    expect(viewRenders.mock.calls.length).toBeGreaterThan(0);
  });

  it('preserves the SSR DOM nodes across resume (morph, not replace)', async () => {
    const client = await serveAndBoot();
    const ssrOutput = document.querySelector('output');

    document.querySelector('button')!.click();
    await client.settled();
    expect(document.querySelector('output')).toBe(ssrOutput);
  });

  it('serves agent reads from the live resource', async () => {
    const client = await serveAndBoot();
    const resource: any = await client.read('ui://counter');

    expect(resource.state.n).toBe(5);
    expect(resource.uri).toBe('ui://counter#default');
  });

  it('routes agent tool calls through guards: auto runs, confirm proposes', async () => {
    const client = await serveAndBoot();
    const proposalEvents: any[] = [];

    document.addEventListener('janux:proposal', (event: any) => proposalEvents.push(event.detail));
    await client.call('counter.inc');
    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('n=6');

    const proposal: any = await client.call('counter.reset');

    expect(proposal.status).toBe('proposal');
    expect(document.querySelector('output')!.textContent).toBe('n=6');
    expect(proposalEvents).toHaveLength(1);
    await client.approve(proposal.id);
    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('n=0');
  });

  it('exposes store tools and state through the bridge', async () => {
    const client = await serveAndBoot();

    await client.call('session.setLocale', { locale: 'es' });
    const resource: any = await client.read('store://session');

    expect(resource.state.locale).toBe('es');
  });

  it('resumes source values from the snapshot — no double-fetch, ready intents work on first click', async () => {
    const clientQuery = mock(async () => ['should-not-run']);
    const shopDef = component({
      name: 'minishop',
      state: schema({ picks: int() }),
      sources: { catalog: source({ query: clientQuery }) },
      intents: {
        pick: intent({
          ready: ({ sources: s }: any) => !s.catalog.pending,
          run: ({ state }: any) => (state.picks += 1),
        }),
      },
      view: ({ state, intents }: any) =>
        jsx('div', {
          children: [
            jsx('output', { children: String(state.picks) }),
            jsx('button', { on: intents.pick, children: 'pick' }),
          ],
        }),
    });
    const { html, snapshots } = await renderToString(jsx(shopDef as any, {}));

    clientQuery.mockClear();
    const scripts = snapshots
      .map(
        (s) =>
          `<script type="application/janux+state" data-uri="${s.uri}">${JSON.stringify({ state: s.state, sources: s.sources })}</script>`,
      )
      .join('');

    document.body.innerHTML = html + scripts;
    const client = boot({ defs: [shopDef] });

    document.querySelector('button')!.click();
    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('1');
    expect(clientQuery).toHaveBeenCalledTimes(0);
  });

  it('emits janux:tool-call events around bridge calls (agent activity)', async () => {
    const client = await serveAndBoot();
    const phases: string[] = [];
    const onTool = (event: any) => phases.push(`${event.detail.tool}:${event.detail.phase}`);

    document.addEventListener('janux:tool-call', onTool);
    await client.call('counter.inc');
    const proposal: any = await client.call('counter.reset');

    expect(phases).toEqual([
      'counter.inc:start',
      'counter.inc:ok',
      'counter.reset:start',
      'counter.reset:proposal',
    ]);
    document.removeEventListener('janux:tool-call', onTool);
    await client.approve(proposal.id);
  });

  it('glow targets the element carrying the intent marker, falling back to the island', async () => {
    const { html, snapshots } = await renderToString(jsx(counter as any, {}), {
      initialState: { 'ui://counter#default': { n: 5, history: [] } },
      storeDefs: { session },
    });
    const scripts = snapshots
      .map(
        (s) =>
          `<script type="application/janux+state" data-uri="${s.uri}">${JSON.stringify({ state: s.state, sources: s.sources ?? {} })}</script>`,
      )
      .join('');

    document.body.innerHTML = html + scripts;
    document.getElementById('janux-glow-styles')?.remove();
    const client = boot({ defs: [counter, session], glow: { duration: 10 } });
    const island = document.querySelector('janux-island')!;
    const incButton = document.querySelector('[data-jxa="counter#default:inc"]')!;

    // counter.inc has a button in the view → the BUTTON glows, not the island
    const pending = client.call('counter.inc');

    expect(incButton.classList.contains('janux-agent-glow')).toBe(true);
    expect(island.classList.contains('janux-agent-glow')).toBe(false);
    await pending;
    // the intent mutated state → re-render happened; morph must NOT wipe the class
    expect(document.querySelector('[data-jxa="counter#default:inc"]')!.classList.contains('janux-agent-glow')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));

    // confirm-guarded intents do NOT glow on call — nothing executed yet
    const resetPending = client.call('counter.reset');

    expect(island.classList.contains('janux-agent-glow')).toBe(false);
    const proposal: any = await resetPending;

    expect(document.querySelectorAll('.janux-agent-glow')).toHaveLength(0);

    // the glow happens on APPROVAL, when the action actually runs
    const approvePending = client.approve(proposal.id);

    expect(island.classList.contains('janux-agent-glow')).toBe(true);
    await approvePending;
  });

  it('boot({ glow: true }) injects styles and glows the operated island', async () => {
    const { html, snapshots } = await renderToString(jsx(counter as any, {}), {
      initialState: { 'ui://counter#default': { n: 1, history: [] } },
      storeDefs: { session },
    });
    const scripts = snapshots
      .map(
        (s) =>
          `<script type="application/janux+state" data-uri="${s.uri}">${JSON.stringify({ state: s.state, sources: s.sources ?? {} })}</script>`,
      )
      .join('');

    document.body.innerHTML = html + scripts;
    document.getElementById('janux-glow-styles')?.remove();
    const client = boot({ defs: [counter, session], glow: { duration: 10 } });

    expect(document.getElementById('janux-glow-styles')).not.toBeNull();
    const pending = client.call('counter.inc');

    expect(document.querySelectorAll('.janux-agent-glow')).toHaveLength(1);
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelectorAll('.janux-agent-glow')).toHaveLength(0);
  });

  /**
   * An intent that CREATES DOM (a React Flow node, a portal, a lazily rendered
   * row) has no delegation marker to glow: the element does not exist when the
   * call starts, and it mounts a tick after the intent returns. `glowTarget`
   * lets the component declare where its effect lands, so the feedback layer
   * can wait for that selector instead of the app deducing it from outside.
   */
  it('carries an intent’s declared glowTarget on the janux:tool-call result', async () => {
    const board = component({
      name: 'board',
      state: schema({ cards: list({ id: str() }) }),
      intents: {
        add: intent({
          input: schema({ id: str() }),
          glowTarget: ({ state }: any) => `.card[data-id="${state.cards.at(-1).id}"]`,
          run: ({ state, input }: any) => state.cards.push({ id: input.id }),
        }),
        touch: intent({ run: ({ state }: any) => state.cards.length }),
      },
      view: () => jsx('div', {}),
    });
    const { html } = await renderToString(jsx(board as any, {}), {
      initialState: { 'ui://board#default': { cards: [] } },
    });
    const details: any[] = [];
    const onTool = (event: any) => details.push(event.detail);

    document.body.innerHTML = html;
    const client = boot({ defs: [board] });

    document.addEventListener('janux:tool-call', onTool);
    await client.call('board.add', { id: 'c1' });
    await client.call('board.touch');
    document.removeEventListener('janux:tool-call', onTool);

    const [start, ok, , plainOk] = details;

    // The selector needs the post-run state, so it rides the resolved call only.
    expect(start.glowTarget).toBeUndefined();
    expect(ok.glowTarget).toBe('.card[data-id="c1"]');
    // An intent that declares nothing adds nothing to the event.
    expect(plainOk.glowTarget).toBeUndefined();
  });

  it('a throwing glowTarget resolver never fails the tool call', async () => {
    const fragile = component({
      name: 'fragile',
      state: schema({ n: int() }),
      intents: {
        bump: intent({
          glowTarget: () => {
            throw new Error('no node yet');
          },
          run: ({ state }: any) => (state.n += 1),
        }),
      },
      view: () => jsx('div', {}),
    });
    const { html } = await renderToString(jsx(fragile as any, {}), {
      initialState: { 'ui://fragile#default': { n: 0 } },
    });
    const errors: string[] = [];
    const onError = (event: any) => errors.push(String(event.detail));

    document.body.innerHTML = html;
    const client = boot({ defs: [fragile] });

    document.addEventListener('janux:error', onError);
    await client.call('fragile.bump');
    document.removeEventListener('janux:error', onError);

    expect(((await client.read('ui://fragile#default')) as any).state.n).toBe(1);
    expect(errors.join()).toContain('no node yet');
  });

  it('the enabled glow paints janux:tool-target elements (DOM-fallback feedback)', async () => {
    document.body.innerHTML = '<button id="go">Go</button>';
    document.getElementById('janux-glow-styles')?.remove();
    boot({ defs: [counter], glow: { duration: 10 } });
    const button = document.getElementById('go')!;

    document.dispatchEvent(
      new CustomEvent('janux:tool-target', { detail: { element: button, action: 'click', selector: '#go' } }),
    );

    expect(button.classList.contains('janux-agent-glow')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1230));
    expect(button.classList.contains('janux-agent-glow')).toBe(false);
  });

  it('survives a malformed state snapshot (boot regression)', async () => {
    document.body.innerHTML =
      '<script type="application/janux+state" data-uri="ui://broken">{not json</script>';
    const client = boot({ defs: [counter] });

    expect(client.manifest().tools).toEqual([]);
  });

  it('builds a live manifest from the mounted tree', async () => {
    const client = await serveAndBoot();

    await client.mount('counter#default');
    const manifest = client.manifest();

    expect(manifest.tools.map((t) => t.name)).toContain('counter.inc');
    expect(manifest.resources.map((r) => r.uri)).toContain('ui://counter');
  });
});
