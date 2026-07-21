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
