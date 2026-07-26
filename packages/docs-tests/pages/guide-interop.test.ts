import { describe, expect, it } from 'bun:test';
import { component, createInstance, int, intent, jsx, list, obj, renderToString, schema, str } from 'janux';
import { foreign, isForeignDef } from 'janux/interop';
import { buildManifest } from 'janux/manifest';
import { createElement } from 'react';

/**
 * guide/interop.md and reference/foreign.md: a React component mounted unchanged.
 * What runs here is everything that doesn't need a browser — the ForeignDef
 * shape and its defaults, SSR inside the host, the intent bridge wiring, and the
 * page's most important promise: a foreign island projects a view ONLY, so the
 * wrap-once shell is what gives an agent control.
 */

/** A real React component — React elements, not Janux nodes. */
function Mixer({ bands }: { bands: { name: string; level: number }[]; onBand?: (input: unknown) => void }) {
  return createElement(
    'div',
    { className: 'mixer' },
    bands.map((band) => createElement('span', { key: band.name }, `${band.name}:${band.level}`)),
  );
}

const MixerIsland = foreign(Mixer, {
  name: 'mixer-canvas',
  props: (own: any) => ({ bands: own.state.bands }),
  on: { onBand: 'setBand' },
  hydrate: 'visible',
});

const MixerShell = component({
  name: 'mixer',
  description: 'A three-band mixer. Bands live in typed state; the sliders are a foreign React island.',
  state: schema({ bands: list(obj({ name: str(), level: int() })).default([{ name: 'low', level: 5 }]) }),
  intents: {
    setBand: intent({
      description: 'Set one band level',
      input: schema({ name: str(), level: int() }),
      run: ({ state, input }: any) => {
        const band = state.bands.find((candidate: any) => candidate.name === input.name);

        if (band) band.level = input.level;
      },
    }),
  },
  view: ({ state }: any) => jsx(MixerIsland as any, { state }),
});

describe('reference/foreign.md — the ForeignDef', () => {
  it('is a frozen def with the documented shape and defaults', () => {
    const bare = foreign(Mixer);

    expect(isForeignDef(MixerIsland)).toBe(true);
    expect(isForeignDef(MixerShell)).toBe(false);
    expect(MixerIsland.kind).toBe('foreign');
    expect(MixerIsland.name).toBe('mixer-canvas');
    expect(MixerIsland.options.hydrate).toBe('visible');
    expect(bare.name).toBe('Mixer'); // falls back to the component's own name
    expect(bare.options.hydrate).toBe('load'); // documented default
    expect(Object.isFrozen(MixerIsland)).toBe(true);
  });

  it('is usable in TSX through a phantom call signature, not a real function', () => {
    // The def carries a call signature so `<MixerIsland />` type-checks; the
    // renderer branches on isForeignDef and never invokes it.
    expect(isForeignDef(jsx(MixerIsland as any, {}).$t)).toBe(true);
  });
});

describe('guide/interop.md — SSR and the agent surface', () => {
  it('server-renders the React component inside its host', async () => {
    const { html } = await renderToString(jsx(MixerShell as any, {}), {});

    expect(html).toContain('janux-island key="mixer#default" data-jx="mixer#default"');
    expect(html).toContain('low:5'); // React rendered on the server, paint before JS
  });

  it('projects a view only: the foreign island contributes no tools or resource', async () => {
    const instance = createInstance(MixerShell);

    await instance.attach();
    const manifest: any = buildManifest([{ def: MixerShell, key: 'default', instance }] as any, {});

    expect(manifest.tools.map((tool: any) => tool.name)).toEqual(['mixer.setBand']);
    expect(manifest.resources.map((resource: any) => resource.uri)).toEqual(['ui://mixer']);
    expect(JSON.stringify(manifest)).not.toContain('mixer-canvas'); // the foreign leaf is invisible
  });

  it('the wrap-once shell is what an agent drives — state in, intents out', async () => {
    const instance = createInstance(MixerShell);

    await instance.attach();
    await instance.intents.setBand({ name: 'low', level: 9 }, { origin: 'agent' });

    expect(instance.snapshot().bands).toEqual([{ name: 'low', level: 9 }]);
    // The props mapper reads that same state, so the React tree follows.
    expect(MixerIsland.options.props!({ state: instance.snapshot() } as any)).toEqual({
      bands: [{ name: 'low', level: 9 }],
    });
  });

  it('maps a foreign callback to an intent name, as the on table documents', () => {
    expect(MixerIsland.options.on).toEqual({ onBand: 'setBand' });
    expect(Object.keys(MixerShell.intents!)).toContain('setBand');
  });
});
