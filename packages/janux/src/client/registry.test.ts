import { describe, expect, it } from 'bun:test';
import { component, schema, str } from '../index';
import { foreign } from '../interop';
import { createClientRegistry, resolveDef } from './registry';

const lazyDef = () =>
  component({
    name: 'lazy-tool',
    state: schema({ label: str().default('hi') }),
    view: ({ state }: any) => state.label,
  });

describe('resolveDef with lazy loaders', () => {
  it('registers component defs exported by the loader module', async () => {
    const registry = createClientRegistry();
    const def = lazyDef();

    // A real loader is `() => import('./TipCalculator.island')`: the module
    // exports its defs, it does not (cannot) call registerDef itself.
    registry.loaders.set('lazy-tool', async () => ({ ToolIsland: def }));

    const resolved = await resolveDef(registry, 'lazy-tool');

    expect(resolved).toBe(def as never);
  });

  it('registers foreign defs exported alongside the island def', async () => {
    const registry = createClientRegistry();
    const def = lazyDef();
    const foreignDef = foreign((() => null) as never, { name: 'lazy-foreign' });

    registry.loaders.set('lazy-tool', async () => ({ default: def, foreignDef }));
    await resolveDef(registry, 'lazy-tool');

    expect(registry.foreignDefs.get('lazy-foreign')).toBe(foreignDef);
  });

  it('still fails clearly when the module exports no matching def', async () => {
    const registry = createClientRegistry();

    registry.loaders.set('ghost', async () => ({ unrelated: 42 }));

    expect(resolveDef(registry, 'ghost')).rejects.toThrow('did not register its def');
  });
});
