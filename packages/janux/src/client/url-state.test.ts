import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { obj, str } from '../schema';
import { urlState } from './url-state';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost/' }));
afterAll(() => GlobalRegistrator.unregister());

describe('typed URL state', () => {
  beforeEach(() => history.replaceState({}, '', '/list'));

  it('reads the initial value from the query string', () => {
    history.replaceState({}, '', '/list?status=paid');
    const handle = urlState('status', str(), 'all');

    expect(handle.value.value).toBe('paid');
  });

  it('falls back when the param is absent', () => {
    const handle = urlState('status', str(), 'all');

    expect(handle.value.value).toBe('all');
  });

  it('writes the param and clears it when set to the fallback', () => {
    const handle = urlState('status', str(), 'all');

    handle.set('pending');
    expect(location.search).toBe('?status=pending');
    handle.set('all');
    expect(location.search).toBe('');
  });

  it('round-trips typed objects through JSON', () => {
    const handle = urlState('filter', obj({ q: str() }), { q: '' });

    handle.set({ q: 'ada' });
    expect(location.search).toContain('filter=');
    const reread = urlState('filter', obj({ q: str() }), { q: '' });

    expect(reread.value.value).toEqual({ q: 'ada' });
  });

  it('reacts to back/forward via popstate', () => {
    const handle = urlState('status', str(), 'all');

    handle.set('paid');
    history.replaceState({}, '', '/list');
    window.dispatchEvent(new Event('popstate'));
    expect(handle.value.value).toBe('all');
  });
});

/**
 * Regression: `urlState()` read `location.search` eagerly, so calling it from an
 * island's view crashed SSR with "location is not defined" — which is why an app
 * had to hand-roll the query sync with typeof guards.
 */
describe('typed URL state during SSR', () => {
  it('yields the fallback with no location instead of throwing', () => {
    const { location: browserLocation } = globalThis as any;

    delete (globalThis as any).location;
    try {
      expect(urlState('status', str(), 'all').value.value).toBe('all');
    } finally {
      (globalThis as any).location = browserLocation;
    }
  });
});
