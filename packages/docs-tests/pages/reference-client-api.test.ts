import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { boot } from 'janux/client';
// The page's own import line: the specs live on the janux root, not janux/client.
import { CLIENT_TOOL_NAMES, CLIENT_TOOL_SPECS, component, int, intent, jsx, renderToString, schema } from 'janux';

/**
 * reference/client-api.md, reference/client-tools.md and the bridge half of
 * guide/agent-and-copilot.md: the six built-in tools, the bridge's six methods,
 * the DOM events the runtime emits and the markers a view compiles to — all
 * driven through a real boot() over server-rendered markup.
 */

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost/shop' }));
afterAll(() => GlobalRegistrator.unregister());
afterEach(() => {
  document.body.innerHTML = '';
  delete (window as any).janux;
});

const counter = component({
  name: 'counter',
  description: 'A counter',
  state: schema({ n: int().default(0) }),
  intents: {
    inc: intent({ description: 'Increment', input: schema({ by: int() }), run: ({ state, input }: any) => (state.n += input.by) }),
    reset: intent({ description: 'Reset', guard: 'confirm', run: ({ state }: any) => (state.n = 0) }),
  },
  view: ({ state, intents }: any) =>
    jsx('div', {
      children: [
        jsx('output', { children: String(state.n) }),
        jsx('button', { on: intents.inc, 'data-input': JSON.stringify({ by: 2 }) , children: '+2' }),
        jsx('form', { intent: intents.inc, children: jsx('input', { name: 'by', value: '5' }) }),
      ],
    }),
});

const MANIFEST_LINK = '<link rel="janux-manifest" id="jx-manifest" href="/_janux/manifest?path=%2Fshop">';

async function booted() {
  const { html, snapshots } = await renderToString(jsx(counter as any, {}), {});
  const scripts = snapshots
    .map(
      (snapshot: any) =>
        `<script type="application/janux+state" data-uri="${snapshot.uri}">${JSON.stringify({ state: snapshot.state, sources: {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = MANIFEST_LINK + html + scripts;

  return boot({ defs: [counter], webmcp: false });
}

describe('reference/client-tools.md', () => {
  it('exposes exactly the six documented tools, and the names set agrees', () => {
    expect(CLIENT_TOOL_SPECS.map((spec) => spec.name)).toEqual([
      'ui_navigate',
      'ui_get_view_context',
      'ui_read_page',
      'ui_click',
      'ui_fill',
      'ui_wait_settled',
    ]);
    expect([...CLIENT_TOOL_NAMES].sort()).toEqual(CLIENT_TOOL_SPECS.map((spec) => spec.name).sort());
    CLIENT_TOOL_SPECS.forEach((spec) => expect(spec.description.length).toBeGreaterThan(10));
  });
});

describe('reference/client-api.md — markers and the bridge', () => {
  it('compiles on/intent props to data-jxa / data-jxform, with no per-element listeners', async () => {
    const { html } = await renderToString(jsx(counter as any, {}), {});

    expect(html).toContain('data-jxa="counter#default:inc"');
    expect(html).toContain('data-jxform="counter#default:inc"');
    expect(html).not.toContain('onclick');
  });

  it('exposes window.janux with the six documented methods after boot', async () => {
    await booted();
    const bridge = (window as any).janux;

    expect(['read', 'call', 'approve', 'reject', 'settled', 'subscribe', 'manifest'].every((key) => typeof bridge[key] === 'function')).toBe(true);
  });

  it('read() returns the resource and call() runs an intent at agent origin', async () => {
    await booted();
    const bridge = (window as any).janux;

    expect((await bridge.read('ui://counter')).state).toMatchObject({ n: 0 });
    await bridge.call('counter.inc', { by: 2 });

    expect((await bridge.read('ui://counter')).state).toMatchObject({ n: 2 });
  });

  it('a confirm guard returns a proposal that approve() executes exactly once', async () => {
    await booted();
    const bridge = (window as any).janux;

    await bridge.call('counter.inc', { by: 3 });
    const proposal: any = await bridge.call('counter.reset');

    expect(proposal).toMatchObject({ status: 'proposal', tool: 'counter.reset' });
    expect((await bridge.read('ui://counter')).state).toMatchObject({ n: 3 }); // not applied yet
    await bridge.approve(proposal.id);

    expect((await bridge.read('ui://counter')).state).toMatchObject({ n: 0 });
    expect(bridge.reject(proposal.id)).toBe(false); // consumed
  });

  it('emits janux:tool-call around every bridge call, and janux:proposal on a confirm', async () => {
    const phases: string[] = [];
    const proposals: unknown[] = [];

    document.addEventListener('janux:tool-call', (event) => phases.push((event as CustomEvent).detail.phase));
    document.addEventListener('janux:proposal', (event) => proposals.push((event as CustomEvent).detail));
    await booted();
    const bridge = (window as any).janux;

    await bridge.call('counter.inc', { by: 1 });

    expect(phases).toEqual(['start', 'ok']);
    await bridge.call('counter.reset');

    expect(phases).toEqual(['start', 'ok', 'start', 'proposal']);
    expect(proposals).toHaveLength(1);
  });

  it('a click on a marked button runs the intent through the delegated listener', async () => {
    await booted();
    (document.querySelector('button[data-jxa]') as HTMLElement).click();
    await (window as any).janux.settled();

    expect(document.querySelector('output')!.textContent).toBe('2');
  });
});
