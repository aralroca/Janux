import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { component, intent, source, store } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, list, schema, str } from '../schema';
import { renderToString } from '../render/server';
import { boot, navigateAction, type BootOptions, type JanuxClient } from './boot';
import { agentCursor } from './cursor';
import { agentGlow } from './glow';

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
        jsx('button', { onClick: intents.inc, children: '+1' }),
      ],
    });
  },
});

async function serveAndBoot(options: Partial<BootOptions> = {}): Promise<JanuxClient> {
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

  return boot({ defs: [counter, session], ...options });
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

  it('settles after a click whose intent throws, reporting it on janux:error instead of rejecting', async () => {
    // The failure already reaches the app through `janux:error`; making
    // `settled()` rethrow it too turns "wait for quiet" into a second throw
    // site, and one that only fires when the call wins the race against the
    // inflight set being cleaned up.
    const brokenDef = component({
      name: 'broken',
      state: schema({ n: int() }),
      intents: {
        boom: intent({
          run: () => {
            throw new Error('intent exploded');
          },
        }),
      },
      view: ({ state, intents }: any) =>
        jsx('div', {
          children: [
            jsx('output', { children: String(state.n) }),
            jsx('button', { onClick: intents.boom, children: 'boom' }),
          ],
        }),
    });
    const { html } = await renderToString(jsx(brokenDef as any, {}));
    const errors: string[] = [];

    document.body.innerHTML = html;
    document.addEventListener('janux:error', (event: any) => errors.push(String(event.detail)));
    const client = boot({ defs: [brokenDef] });

    document.querySelector('button')!.click();

    await client.settled();

    expect(errors.join(' ')).toContain('intent exploded');
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
            jsx('button', { onClick: intents.pick, children: 'pick' }),
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
    const client = boot({ defs: [counter, session], glow: agentGlow({ duration: 10 }) });
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

  it('boot({ cursor: agentCursor() }) walks the simulated cursor to the operated control', async () => {
    const client = await serveAndBoot({ cursor: agentCursor({ duration: 10 }) });
    const incButton = document.querySelector('[data-jxa="counter#default:inc"]')!;

    incButton.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 40, height: 20, right: 140, bottom: 220, x: 100, y: 200 }) as DOMRect;
    expect(document.getElementById('janux-cursor-styles')).not.toBeNull();
    const pending = client.call('counter.inc');
    const cursor = document.getElementById('janux-agent-cursor')!;

    // The wiring is what this proves: the call reached the cursor layer and parked it on +1.
    expect(cursor.classList.contains('on')).toBe(true);
    expect(cursor.style.transform).toBe('translate(120px, 210px)');
    await pending;
  });

  it('boot({ glow: agentGlow() }) injects styles and glows the operated island', async () => {
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
    const client = boot({ defs: [counter, session], glow: agentGlow({ duration: 10 }) });

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

    const [start, ok, plainStart, plainOk] = details;

    // The selector needs the post-run state, so it rides the resolved call only.
    expect(start.glowTarget).toBeUndefined();
    expect(ok.glowTarget).toBe('.card[data-id="c1"]');
    // …but the start says one is coming, so a feedback layer doesn't guess a
    // target from the view and then get overridden a moment later.
    expect(start.glowTargetPending).toBe(true);
    // An intent that declares nothing adds nothing to either event.
    expect(plainStart.glowTargetPending).toBeUndefined();
    expect(plainOk.glowTarget).toBeUndefined();
  });

  /** For a confirm-guarded intent the approval IS the execution, so that's when its effect exists. */
  it('resolves glowTarget on approval too, not only on direct calls', async () => {
    const gated = component({
      name: 'gated',
      state: schema({ cards: list({ id: str() }) }),
      intents: {
        add: intent({
          guard: 'confirm',
          input: schema({ id: str() }),
          glowTarget: ({ state }: any) => `.card[data-id="${state.cards.at(-1).id}"]`,
          run: ({ state, input }: any) => state.cards.push({ id: input.id }),
        }),
      },
      view: () => jsx('div', {}),
    });
    const { html } = await renderToString(jsx(gated as any, {}), { initialState: { 'ui://gated#default': { cards: [] } } });
    const details: any[] = [];
    const onTool = (event: any) => details.push(event.detail);

    document.body.innerHTML = html;
    const client = boot({ defs: [gated] });
    const proposal: any = await client.call('gated.add', { id: 'c9' });

    document.addEventListener('janux:tool-call', onTool);
    await client.approve(proposal.id);
    document.removeEventListener('janux:tool-call', onTool);

    expect(details.map((detail) => detail.phase)).toEqual(['start', 'ok']);
    expect(details[0].glowTargetPending).toBe(true);
    expect(details[1].glowTarget).toBe('.card[data-id="c9"]');
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

  // Guard, not a new behavior: morph is island-scoped, and an overlay host lives
  // outside every island precisely so re-renders can't take it down.
  it('island re-renders never touch runtime nodes outside the island', async () => {
    const client = await serveAndBoot();
    const overlay = document.createElement('div');

    overlay.id = 'agent-overlay';
    document.body.appendChild(overlay);
    await client.call('counter.inc');
    await client.call('counter.inc');
    await client.settled();

    expect(document.getElementById('agent-overlay')).toBe(overlay);
  });

  it('the enabled glow paints janux:tool-target elements (DOM-fallback feedback)', async () => {
    document.body.innerHTML = '<button id="go">Go</button>';
    document.getElementById('janux-glow-styles')?.remove();
    boot({ defs: [counter], glow: agentGlow({ duration: 10 }) });
    const button = document.getElementById('go')!;

    document.dispatchEvent(
      new CustomEvent('janux:tool-target', { detail: { element: button, action: 'click', selector: '#go' } }),
    );

    expect(button.classList.contains('janux-agent-glow')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1230));
    expect(button.classList.contains('janux-agent-glow')).toBe(false);
  });

  /**
   * A richer feedback layer (chips + animated ring + veil) consumes the same two
   * events as the built-in glow, so both would paint the same element at once.
   * The built-in one stands down while another layer holds the floor — the app
   * never has to turn `glow` off to avoid the double highlight.
   */
  it('suspendAgentGlow hands the painting over to another feedback layer', async () => {
    const { suspendAgentGlow } = await import('./glow');

    document.body.innerHTML = '<button id="go">Go</button>';
    document.getElementById('janux-glow-styles')?.remove();
    boot({ defs: [counter], glow: agentGlow({ duration: 10 }) });
    const button = document.getElementById('go')!;
    const flash = () =>
      document.dispatchEvent(
        new CustomEvent('janux:tool-target', { detail: { element: button, action: 'click', selector: '#go' } }),
      );
    const resume = suspendAgentGlow();

    flash();
    expect(button.classList.contains('janux-agent-glow')).toBe(false);
    resume();
    flash();
    expect(button.classList.contains('janux-agent-glow')).toBe(true);
    button.classList.remove('janux-agent-glow');
  });

  /**
   * The glow is a class, and `morph` deliberately preserves `janux-*` classes
   * across re-renders — so whatever paints one has to be the one that clears it.
   * Resolving the target again on the closing phase could come back empty (a
   * suspension started mid-call, the island stopped being painted) and leave the
   * element lit for the rest of the session.
   */
  it('clears the glow it painted even when the target can no longer be resolved', async () => {
    const { suspendAgentGlow } = await import('./glow');

    document.body.innerHTML = '<button id="go">Go</button>';
    boot({ defs: [counter], glow: agentGlow({ duration: 5 }) });
    const button = document.getElementById('go')!;
    const fire = (phase: string) =>
      document.dispatchEvent(
        new CustomEvent('janux:tool-call', { detail: { tool: 'counter.inc', phase, guard: 'auto' } }),
      );

    // The island the tool belongs to isn't even in this DOM: the painted element
    // is what must be remembered, not the query that found it.
    document.body.innerHTML = '<janux-island data-jx="counter#default"><button>+1</button></janux-island>';
    const island = document.querySelector('janux-island')!;

    fire('start');
    expect(island.classList.contains('janux-agent-glow')).toBe(true);
    const resume = suspendAgentGlow();

    fire('ok');
    resume();
    await new Promise((done) => setTimeout(done, 30));
    expect(island.classList.contains('janux-agent-glow')).toBe(false);
    button.remove();
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

/**
 * The audit trail an instance produces (see runtime/intents.ts) reaches the
 * page as a first-class signal: `boot({ onAudit })` for the app's own code and
 * a `janux:audit` DOM event for islands that only see the document — the same
 * mirror `janux:proposal` already has. Apps stop re-recording actions by hand
 * inside every `run()`.
 */
describe('client audit mirroring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('every client AuditEntry reaches boot({ onAudit }) and fires janux:audit', async () => {
    const entries: any[] = [];
    const events: any[] = [];
    const onEvent = (event: any) => events.push(event.detail);

    document.addEventListener('janux:audit', onEvent);
    const client = await serveAndBoot({ onAudit: (entry: any) => entries.push(entry) });

    await client.call('counter.inc');
    document.querySelector('button')!.click();
    await client.settled();
    document.removeEventListener('janux:audit', onEvent);

    expect(entries.map((entry) => `${entry.tool}:${entry.origin}:${entry.ok}`)).toEqual([
      'counter.inc:agent:true',
      'counter.inc:human:true',
    ]);
    expect(events).toEqual(entries);
  });

  it('a parked proposal audits as proposed on call and as executed on approval', async () => {
    const entries: any[] = [];
    const client = await serveAndBoot({ onAudit: (entry: any) => entries.push(entry) });
    const proposal: any = await client.call('counter.reset');

    expect(entries.map((entry) => `${entry.tool}:${entry.proposed ?? false}`)).toEqual(['counter.reset:true']);
    await client.approve(proposal.id);
    expect(entries.map((entry) => `${entry.tool}:${entry.proposed ?? false}`)).toEqual([
      'counter.reset:true',
      'counter.reset:false',
    ]);
  });
});

/**
 * The manifest announces `api.*` server tools, so `window.janux.call` must
 * dispatch them too — over their HTTP endpoint, as the agent surface. A
 * `confirm` guard parks the proposal on the server; the bridge mirrors it
 * locally so `janux:proposal`, `approve()` and `reject()` behave exactly like
 * they do for component intents.
 */
describe('bridge api.* server tools', () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init: RequestInit }[] = [];
  const proposalBody = {
    ok: true,
    result: { status: 'proposal', id: 'prop_api_1', tool: 'payments.transfer', input: { to: 'Acme' } },
  };
  let respond: (url: string) => unknown;

  beforeEach(() => {
    document.body.innerHTML = '';
    requests.length = 0;
    respond = () => ({ ok: true, result: { paid: true } });
    globalThis.fetch = mock(async (input: any, init?: RequestInit) => {
      requests.push({ url: String(input), init: init! });

      return Response.json(respond(String(input)));
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('routes api.* calls to /_janux/api with the agent origin and unwraps the result', async () => {
    const client = await serveAndBoot();
    const result = await client.call('api.payments.transfer', { to: 'Acme' });

    expect(result).toEqual({ paid: true });
    const [request] = requests;

    expect(request!.url).toBe('/_janux/api/payments.transfer');
    expect((request!.init.headers as any)['x-janux-origin']).toBe('agent');
    expect(JSON.parse(String(request!.init.body))).toEqual({ to: 'Acme' });
  });

  it('surfaces a failed api call as a thrown error', async () => {
    respond = () => ({ ok: false, error: 'boom' });
    const client = await serveAndBoot();

    expect(client.call('api.payments.transfer', {})).rejects.toThrow('boom');
  });

  it('emits janux:tool-call activity around api calls', async () => {
    respond = (url) => (url.startsWith('/_janux/api/') ? proposalBody : { ok: true, result: true });
    const phases: string[] = [];
    const onTool = (event: any) => phases.push(event.detail.phase);
    const client = await serveAndBoot();

    document.addEventListener('janux:tool-call', onTool);
    await client.call('api.payments.transfer', { to: 'Acme' });
    document.removeEventListener('janux:tool-call', onTool);
    expect(phases).toEqual(['start', 'proposal']);
  });

  it('mirrors a server proposal: janux:proposal fires and approve settles via /_janux/approve', async () => {
    respond = (url) => (url.startsWith('/_janux/api/') ? proposalBody : { ok: true, result: { transferId: 'tr_1' } });
    const proposalEvents: any[] = [];
    const onProposal = (event: any) => proposalEvents.push(event.detail);

    document.addEventListener('janux:proposal', onProposal);
    const client = await serveAndBoot();
    const proposed: any = await client.call('api.payments.transfer', { to: 'Acme' });

    document.removeEventListener('janux:proposal', onProposal);
    expect(proposed.status).toBe('proposal');
    expect(proposalEvents.map((proposal) => proposal.id)).toEqual(['prop_api_1']);
    expect(client.proposals.has('prop_api_1')).toBe(true);

    const approved = await client.approve('prop_api_1');

    expect(approved).toEqual({ transferId: 'tr_1' });
    const settle = requests.at(-1)!;

    expect(settle.url).toBe('/_janux/approve');
    expect(JSON.parse(String(settle.init.body))).toEqual({ id: 'prop_api_1' });
    // Approval is a human act: the agent origin header must NOT ride along.
    expect((settle.init.headers as any)['x-janux-origin']).toBeUndefined();
    expect(client.proposals.has('prop_api_1')).toBe(false);
  });

  /**
   * The human who settles a `confirm` guard is on the app that owns the tool,
   * not on whatever parked the call: an agent reaching in over MCP or A2A
   * leaves a proposal no page here ever mirrored. The bridge forwards it rather
   * than inventing a refusal — the vault, which holds the key, decides.
   */
  it('approves a proposal parked by a remote agent, which this page never mirrored', async () => {
    respond = () => ({ ok: true, result: { id: 7, shipped: true } });
    const client = await serveAndBoot();
    const settled = await client.approve('prop_api_remote.signature');

    expect(settled).toEqual({ id: 7, shipped: true });
    const request = requests.at(-1)!;

    expect(request.url).toBe('/_janux/approve');
    expect(JSON.parse(String(request.init.body))).toEqual({ id: 'prop_api_remote.signature' });
    expect((request.init.headers as any)['x-janux-origin']).toBeUndefined();
  });

  it('lets the server refuse a token this page cannot judge', async () => {
    respond = () => ({ ok: false, error: 'proposal token does not match this session and payload' });
    const client = await serveAndBoot();

    expect(client.approve('prop_api_stolen.signature')).rejects.toThrow('does not match this session');
  });

  it('rejects a remotely parked proposal on the server too', async () => {
    respond = () => ({ ok: true, result: true });
    const client = await serveAndBoot();

    client.reject('prop_api_remote.signature');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.at(-1)!.url).toBe('/_janux/reject');
  });

  it('still refuses a proposal this page already settled, without asking the server again', async () => {
    respond = (url) => (url.startsWith('/_janux/api/') ? proposalBody : { ok: true, result: true });
    const client = await serveAndBoot();

    await client.call('api.payments.transfer', { to: 'Acme' });
    await client.approve('prop_api_1');
    const settlements = requests.filter((request) => request.url === '/_janux/approve').length;

    expect(client.approve('prop_api_1')).rejects.toThrow('unknown proposal');
    expect(requests.filter((request) => request.url === '/_janux/approve')).toHaveLength(settlements);
  });

  it('reject clears the mirrored proposal locally and tells the server', async () => {
    respond = (url) => (url.startsWith('/_janux/api/') ? proposalBody : { ok: true, result: true });
    const client = await serveAndBoot();

    await client.call('api.payments.transfer', { to: 'Acme' });
    expect(client.reject('prop_api_1')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.at(-1)!.url).toBe('/_janux/reject');
  });
});

/**
 * `janux.config.ts` reaches the client through a keyed script in the shell:
 * there is no other channel, and `boot()` runs in the app's own code, so an
 * option set in the config must not need repeating there.
 */
describe('navigation config from the shell', () => {
  const shellConfig = (config: unknown) => {
    document.body.innerHTML = '';
    document.head.innerHTML = `<script type="application/janux+config" id="jx-config">${JSON.stringify(config)}</script>`;
  };

  /** What `boot()` subscribed to, which is how "navigation was installed" shows. */
  function listenersInstalledBy(run: () => void): string[] {
    const installed: string[] = [];
    const originalAdd = document.addEventListener.bind(document);

    (document as any).addEventListener = (type: string, ...rest: unknown[]) => {
      installed.push(type);

      return originalAdd(type, ...(rest as [any]));
    };
    try {
      run();
    } finally {
      (document as any).addEventListener = originalAdd;
    }

    return installed;
  }

  beforeEach(() => {
    (window as any).navigation = { addEventListener() {} };
    document.getElementById('jx-speculation')?.remove();
  });

  it('turns SPA navigation off when the config says so', () => {
    shellConfig({ navigation: { spa: false } });

    expect(listenersInstalledBy(() => boot({ defs: [] }))).not.toContain('mouseover');
  });

  it('lets boot() options win over the shell config', () => {
    shellConfig({ navigation: { spa: false } });

    expect(listenersInstalledBy(() => boot({ defs: [], navigation: true }))).toContain('mouseover');
  });

  it('skips hover prefetching when the config turns it off', () => {
    shellConfig({ navigation: { prefetch: false } });

    expect(listenersInstalledBy(() => boot({ defs: [] }))).not.toContain('mouseover');
  });

  /**
   * Without interception a hover fetch is pure waste: the browser navigates the
   * document itself and never looks at a stream sitting in a JS Map. That case
   * is what the speculation rules are for.
   */
  it('does not hover-prefetch in a browser with no Navigation API', () => {
    delete (window as any).navigation;
    shellConfig({});

    expect(listenersInstalledBy(() => boot({ defs: [] }))).not.toContain('mouseover');
  });

  /**
   * A document-wide speculation rule is waste once Janux intercepts clicks: the
   * speculated document is never used, and hover pays for the page twice. The
   * rules the server emitted are rewritten to cover only what the browser still
   * navigates itself.
   */
  it('rescopes the server speculation rules to native links once installed', () => {
    document.body.innerHTML = '';
    document.head.innerHTML =
      '<script type="speculationrules" id="jx-speculation">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}</script>';
    (window as any).navigation = { addEventListener() {} };
    boot({ defs: [] });

    const rules = JSON.parse(document.getElementById('jx-speculation')!.textContent!);

    expect(rules.prefetch[0].where).toEqual({ selector_matches: 'a[data-native]' });
  });

  it('leaves them alone in a browser with no Navigation API', () => {
    delete (window as any).navigation;
    document.body.innerHTML = '';
    document.head.innerHTML =
      '<script type="speculationrules" id="jx-speculation">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}</script>';
    boot({ defs: [] });

    const rules = JSON.parse(document.getElementById('jx-speculation')!.textContent!);

    expect(rules.prefetch[0].where).toEqual({ href_matches: '/*' });
  });
});

/**
 * What the router does with each navigation. The identical-URL case has now
 * bitten twice, once in each direction: intercepting it re-diffed the page
 * against itself (an emptied /playground editor), and refusing to intercept it
 * handed the click back to the browser, whose default action is a full
 * cross-document reload — every island lost, the open assistant included. The
 * router's answer is 'cancel': same URL, nothing to do, so nothing happens.
 */
const HERE = 'http://localhost:3000/playground';
const navigateEvent = (url: string, extra: Record<string, unknown> = {}) => ({
  canIntercept: true,
  cancelable: true,
  hashChange: false,
  downloadRequest: null,
  formData: null,
  navigationType: 'push',
  destination: { url },
  ...extra,
});

describe('navigateAction', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: new URL(HERE) });
  });

  it('takes over a link to another page', () => {
    expect(navigateAction(navigateEvent('http://localhost:3000/docs'))).toBe('intercept');
  });

  it('cancels a navigation to the page we are already on', () => {
    expect(navigateAction(navigateEvent(HERE))).toBe('cancel');
  });

  it('lets a reload reload, even though its destination is the current URL', () => {
    expect(navigateAction(navigateEvent(HERE, { navigationType: 'reload' }))).toBe('default');
  });

  it('lets a data-native link to the current page keep its native reload', () => {
    const sourceElement = { closest: () => ({}) };

    expect(navigateAction(navigateEvent(HERE, { sourceElement }))).toBe('default');
  });

  it('still leaves query-only changes and other origins to the app', () => {
    expect(navigateAction(navigateEvent(`${HERE}?tab=two`))).toBe('default');
    expect(navigateAction(navigateEvent('https://example.com/'))).toBe('default');
  });

  /** A link marked `data-shallow` moves the URL and leaves the page alone. */
  it('takes a data-shallow link over as a shallow change', () => {
    const sourceElement = { closest: (selector: string) => (selector.includes('shallow') ? {} : null) };

    expect(navigateAction(navigateEvent(`${HERE}?tab=two`, { sourceElement }))).toBe('shallow');
    // Shallow is not only for the query: a path can move without a re-render too.
    expect(navigateAction(navigateEvent('http://localhost:3000/docs', { sourceElement }))).toBe('shallow');
  });

  /** `data-native` still wins: it asked for the browser, which is not a shallow change. */
  it('lets data-native beat data-shallow', () => {
    const sourceElement = { closest: () => ({}) };

    expect(navigateAction(navigateEvent(`${HERE}?tab=two`, { sourceElement }))).toBe('default');
  });
});

describe('same-page navigation is a no-op', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: new URL(HERE) });
  });

  it('cancels the navigate event instead of letting the browser reload', () => {
    let onNavigate: ((event: unknown) => void) | undefined;

    (window as any).navigation = { addEventListener: (_: string, listener: any) => (onNavigate = listener) };
    document.body.innerHTML = '';
    boot({ defs: [] });
    const preventDefault = mock(() => {});
    const intercept = mock(() => {});

    onNavigate!(navigateEvent(HERE, { preventDefault, intercept }));

    expect(preventDefault).toHaveBeenCalled();
    expect(intercept).not.toHaveBeenCalled();

    onNavigate!(navigateEvent(HERE, { navigationType: 'reload', preventDefault, intercept }));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(intercept).not.toHaveBeenCalled();
    delete (window as any).navigation;
  });

  it('client.navigate() to the current URL resolves without navigating', async () => {
    const navigate = mock(() => ({ finished: Promise.resolve() }));

    (window as any).navigation = { addEventListener() {}, navigate };
    document.body.innerHTML = '';
    const client = boot({ defs: [] });

    await client.navigate(HERE);

    expect(navigate).not.toHaveBeenCalled();

    await client.navigate('/docs');

    expect(navigate).toHaveBeenCalledWith('http://localhost:3000/docs');
    delete (window as any).navigation;
  });
});
