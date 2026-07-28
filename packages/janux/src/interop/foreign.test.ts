import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createElement, useEffect, useState } from 'react';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { bool, int, schema, str } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from '../client/boot';
import { foreign } from './index';

beforeAll(() => GlobalRegistrator.register());
afterAll(async () => {
  // Let React's scheduler drain pending work while `window` still exists.
  document.body.innerHTML = '';
  await new Promise((resolve) => setTimeout(resolve, 50));
  GlobalRegistrator.unregister();
});

const unmounts: string[] = [];

/** A plain React component — untouched by Janux. */
function Gauge({ level, label, onPick }: { level: number; label: string; onPick?: (input: unknown) => void }) {
  // `live` flips only in a MOUNTED client root (effects never run in SSR), so
  // tests can tell a live React tree from inert server markup.
  const [live, setLive] = useState(false);

  useEffect(function trackUnmount() {
    setLive(true);

    return () => {
      unmounts.push('gauge');
    };
  }, []);

  return createElement(
    'div',
    { className: 'gauge' },
    createElement('output', { className: 'gauge-level' }, `${label}:${level}`),
    createElement('output', { className: 'gauge-live' }, live ? 'yes' : 'no'),
    createElement('button', { className: 'gauge-pick', onClick: () => onPick?.({ amount: 5 }) }, 'pick'),
  );
}

const GaugeIsland = foreign(Gauge, {
  name: 'gauge',
  props: (own: any) => ({ level: own.state.level, label: own.state.label }),
  on: { onPick: 'pick' },
});

const shell = component({
  name: 'shell',
  state: schema({ level: int(), label: str().default('vol'), showGauge: bool().default(true) }),
  intents: {
    up: intent({ run: ({ state }) => (state.level += 1) }),
    pick: intent({
      input: schema({ amount: int() }),
      run: ({ state, input }) => (state.level = input.amount),
    }),
    toggle: intent({ run: ({ state }) => (state.showGauge = !state.showGauge) }),
  },
  view: ({ state, intents }: any) =>
    jsx('section', {
      children: [
        jsx('button', { class: 'up', onClick: intents.up, children: '+' }),
        jsx('button', { class: 'toggle', onClick: intents.toggle, children: 't' }),
        state.showGauge ? jsx(GaugeIsland as any, { state }) : null,
      ],
    }),
});

async function until(check: () => boolean, ms = 1500): Promise<void> {
  const start = Date.now();

  while (!check()) {
    if (Date.now() - start > ms) throw new Error('until: condition not met');
    await (globalThis as any).happyDOM?.waitUntilComplete?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** True once React has attached its root to the foreign host (post-SSR content). */
function reactMounted(): boolean {
  const host = document.querySelector('janux-foreign');

  return !!host && Object.keys(host).some((key) => key.startsWith('__reactContainer'));
}

async function serveAndBoot(): Promise<JanuxClient> {
  const { html, snapshots } = await renderToString(jsx(shell as any, {}), {
    initialState: { 'ui://shell#default': { level: 2, label: 'vol', showGauge: true } },
  });
  const scripts = snapshots
    .map(
      (snap) =>
        `<script type="application/janux+state" data-uri="${snap.uri}">${JSON.stringify({ state: snap.state, sources: snap.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = html + scripts;

  return boot({ defs: [shell, GaugeIsland] });
}

describe('foreign React interop', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    unmounts.length = 0;
  });

  it('SSR renders the React component inside an opaque foreign host', async () => {
    const { html } = await renderToString(jsx(shell as any, {}), {
      initialState: { 'ui://shell#default': { level: 2, label: 'vol', showGauge: true } },
    });

    expect(html).toContain('data-jx="gauge#shell.default.1"');
    expect(html).toContain('vol:2');
  });

  it('keeps foreign components out of the agent surface (opaque by design)', async () => {
    const { registry } = await renderToString(jsx(shell as any, {}), {});
    const names = registry.islands.map(({ def }) => def.name);

    expect(names).toContain('shell');
    expect(names).not.toContain('gauge');
  });

  it('hydrates on boot and re-renders through the tracked props bridge', async () => {
    const client = await serveAndBoot();

    await until(() => document.querySelector('.gauge-level')?.textContent === 'vol:2');
    await client.call('shell.up');
    await client.settled();
    await until(() => document.querySelector('.gauge-level')?.textContent === 'vol:3');
  });

  it('bridges foreign callbacks to the enclosing island intents', async () => {
    const client = await serveAndBoot();

    await until(() => reactMounted() && !!document.querySelector('.gauge-pick'));
    (document.querySelector('.gauge-pick') as HTMLElement).click();
    await client.settled();
    await until(() => document.querySelector('.gauge-level')?.textContent === 'vol:5');
  });

  it('unmounts the React root when the parent view drops the foreign leaf', async () => {
    const client = await serveAndBoot();

    await until(() => reactMounted() && !!document.querySelector('.gauge'));
    await client.call('shell.toggle');
    await client.settled();
    await until(() => unmounts.length === 1);
    expect(document.querySelector('.gauge')).toBeNull();

    await client.call('shell.toggle');
    await client.settled();
    await until(() => document.querySelector('.gauge-level')?.textContent === 'vol:2');
  });

  it('mounts a standalone foreign from serialized call-site props', async () => {
    const { html } = await renderToString(
      jsx('main', { children: jsx(GaugeIsland as any, { state: { level: 9, label: 'top' } }) }),
      {},
    );

    document.body.innerHTML = html;
    boot({ defs: [GaugeIsland] });
    await until(() => document.querySelector('.gauge-level')?.textContent === 'top:9');
  });

  it('refreshes a preserved standalone foreign with the next page\'s call-site props', async () => {
    const pageHtml = async (level: number, label: string) => {
      const { html } = await renderToString(
        jsx('main', { children: jsx(GaugeIsland as any, { state: { level, label } }) }),
        {},
      );

      return html;
    };

    document.body.innerHTML = await pageHtml(9, 'top');
    const client = boot({ defs: [GaugeIsland] });

    await until(() => document.querySelector('.gauge-level')?.textContent === 'top:9');

    // Navigation serves the same page with DIFFERENT call-site props: the host
    // survives the morph, and the live React root must receive the new props.
    const nextBody = await pageHtml(4, 'alt');
    const realFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response(`<!doctype html><html><head></head><body>${nextBody}</body></html>`, {
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;
    try {
      await client.navigate('http://localhost/next');
      // Not just the SSR markup: a LIVE React root must own the host again
      // (navigation re-runs the document foreign pass), showing the new props.
      // `.gauge-live` flips to "yes" only from a mounted client effect.
      await until(
        () =>
          document.querySelector('.gauge-level')?.textContent === 'alt:4' &&
          document.querySelector('.gauge-live')?.textContent === 'yes',
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
