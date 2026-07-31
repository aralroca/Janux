import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { obj, str } from '../schema';
import { shallowNavigate } from './shallow';
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

/**
 * Shallow routing: changing the URL without re-rendering the page. `urlState`
 * is the typed face of it, so every binding on a param has to see the change —
 * `history.pushState` fires no event, so a second handle used to go stale and
 * an island reading the same param kept rendering the old value.
 */
describe('shallow routing', () => {
  beforeEach(() => history.replaceState({}, '', '/list'));

  it('keeps every binding on the same param in sync', () => {
    const one = urlState('status', str(), 'all');
    const two = urlState('status', str(), 'all');

    one.set('paid');

    expect(two.value.value).toBe('paid');
  });

  it('updates bindings when the URL is changed shallowly from elsewhere', () => {
    const handle = urlState('status', str(), 'all');

    shallowNavigate('/list?status=refunded');

    expect(handle.value.value).toBe('refunded');
    expect(location.search).toBe('?status=refunded');
  });

  /** The point of shallow: the entry changes, the page does not. */
  it('pushes a history entry by default and replaces on request', () => {
    const before = history.length;

    shallowNavigate('/list?status=paid');
    expect(history.length).toBe(before + 1);
    shallowNavigate('/list?status=void', { replace: true });
    expect(history.length).toBe(before + 1);
    expect(location.search).toBe('?status=void');
  });

  it('leaves a binding for another param alone', () => {
    const status = urlState('status', str(), 'all');
    const tag = urlState('tag', str(), 'none');

    shallowNavigate('/list?status=paid');

    expect(status.value.value).toBe('paid');
    expect(tag.value.value).toBe('none');
  });
});
