import { describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { buildManifest } from '../manifest';
import { createInstance } from './instance';
import { resolveGuard } from './intents';
import { allowsScopes, grantedScopes } from './scopes';

describe('grantedScopes()', () => {
  it('is what the credential granted, when no agent is acting', () => {
    expect(grantedScopes({ scopes: ['orders:read', 'orders:write'] })).toEqual(['orders:read', 'orders:write']);
  });

  it('grants nothing to a caller whose ctx carries no grant', () => {
    expect(grantedScopes({})).toEqual([]);
  });

  it('narrows to what the agent may spend of it', () => {
    const ctx = { scopes: ['orders:read', 'orders:write'], agent: { verified: true, scopes: ['orders:read'] } };

    expect(grantedScopes(ctx)).toEqual(['orders:read']);
  });

  it('lets an agent without its own grant act with the whole of the user’s', () => {
    const ctx = { scopes: ['orders:read'], agent: { verified: true } };

    expect(grantedScopes(ctx)).toEqual(['orders:read']);
  });

  it('never lets an agent exceed its user — the intersection is the answer, not the union', () => {
    const ctx = { scopes: ['orders:read'], agent: { verified: true, scopes: ['orders:read', 'orders:write'] } };

    expect(grantedScopes(ctx)).toEqual(['orders:read']);
  });
});

describe('allowsScopes()', () => {
  it('allows a tool that requires nothing — declaring scopes is the opt-in', () => {
    expect(allowsScopes({}, undefined)).toBe(true);
    expect(allowsScopes({}, [])).toBe(true);
  });

  it('allows a tool whose every required scope was granted', () => {
    expect(allowsScopes({ scopes: ['a', 'b'] }, ['a', 'b'])).toBe(true);
  });

  it('denies when a single required scope is missing', () => {
    expect(allowsScopes({ scopes: ['a'] }, ['a', 'b'])).toBe(false);
  });

  it('denies a scoped tool for a caller with no grant at all', () => {
    expect(allowsScopes({}, ['a'])).toBe(false);
  });

  /** `'admin'.includes('admin')` is true, so a string grant used to pass the check it should fail. */
  it('denies when the grant is not a list of scopes at all', () => {
    expect(allowsScopes({ scopes: 'admin' as unknown as string[] }, ['admin'])).toBe(false);
    expect(allowsScopes({ scopes: ['a'], agent: { scopes: 'a' as unknown as string[] } }, ['a'])).toBe(false);
  });
});

const READ_ONLY = { scopes: ['orders:read'] };

const ordersDef = () =>
  component({
    name: 'orders',
    intents: {
      list: intent({ description: 'List orders', scopes: ['orders:read'], run: () => 'LISTED' }),
      refund: intent({ description: 'Refund', scopes: ['orders:write'], run: () => 'REFUNDED' }),
    },
    view: () => null,
  });

describe('an out-of-scope intent', () => {
  it('resolves as forbidden, so every listing drops it', () => {
    const def = ordersDef();

    expect(resolveGuard(def.intents!.refund!, READ_ONLY, 'agent')).toBe('forbidden');
    expect(resolveGuard(def.intents!.list!, READ_ONLY, 'agent')).toBe('auto');
  });

  it('is absent from the manifest the context can see', () => {
    const def = ordersDef();
    const tools = buildManifest([{ def }], READ_ONLY).tools.map((tool) => tool.name);

    expect(tools).toEqual(['orders.list']);
  });

  it('is refused for an agent, not merely hidden from it', async () => {
    const instance = createInstance(ordersDef(), { ctx: READ_ONLY });

    expect(instance.intents.refund!({}, { origin: 'agent' })).rejects.toThrow('Intent "orders.refund" is not available');
    expect(await instance.intents.list!({}, { origin: 'agent' })).toBe('LISTED');
  });

  /**
   * A guard is governance and only binds the agent surface; a scope is
   * authorization and binds the credential. Claiming to be human is free —
   * `x-janux-origin` is a hint, not proof — so a scope that only held for
   * `origin: 'agent'` would be one omitted header away from nothing.
   */
  it('is refused for a caller claiming to be human too', () => {
    const instance = createInstance(ordersDef(), { ctx: READ_ONLY });

    expect(instance.intents.refund!({})).rejects.toThrow('Intent "orders.refund" is not available');
  });
});
