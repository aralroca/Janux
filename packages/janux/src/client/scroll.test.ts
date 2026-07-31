import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { applyScrollPlan, rememberScroll, scrollPlanFor } from './scroll';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/list' }));
afterAll(() => GlobalRegistrator.unregister());

/** The one thing the platform gives us to key an offset by: the entry's id. */
function atEntry(key: string): void {
  (window as any).navigation = { currentEntry: { key } };
}

const scrollTo = mock((_x: number, _y: number) => {});

beforeEach(() => {
  scrollTo.mockClear();
  (window as any).scrollTo = scrollTo;
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
  document.body.innerHTML = '';
  history.replaceState({}, '', '/list');
  delete (window as any).navigation;
});

/*
 * The window is global to the whole test process, and the stub above is a
 * `navigation` without `addEventListener` — exactly the shape `boot()` refuses
 * to survive. Leaving it behind takes down every suite that boots after this
 * file, which is a failure CI sees and a single-file run never does.
 */
afterEach(() => {
  delete (window as any).navigation;
});

describe('what the incoming page should do with the scroll', () => {
  it('reads a traversal off the navigation event', () => {
    expect(scrollPlanFor({ navigationType: 'traverse', destination: { key: 'k1' } })).toEqual({
      key: 'k1',
      traverse: true,
    });
  });

  it('treats everything that is not a traversal as a new page', () => {
    expect(scrollPlanFor({ navigationType: 'push', destination: { key: 'k2' } })).toEqual({
      key: 'k2',
      traverse: false,
    });
  });

  it('survives an event with no destination key', () => {
    expect(scrollPlanFor({ navigationType: 'push', destination: {} })).toEqual({ key: undefined, traverse: false });
  });
});

describe('restoring a remembered offset', () => {
  it('puts back what the entry was left at', () => {
    atEntry('list');
    (window as any).scrollY = 420;
    rememberScroll();

    applyScrollPlan({ key: 'list', traverse: true });

    expect(scrollTo).toHaveBeenCalledWith(0, 420);
  });

  /** Two entries, two offsets: the key is what keeps them apart. */
  it('keeps one offset per history entry', () => {
    atEntry('list');
    (window as any).scrollY = 420;
    rememberScroll();
    atEntry('item');
    (window as any).scrollY = 40;
    rememberScroll();

    applyScrollPlan({ key: 'list', traverse: true });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420);
    applyScrollPlan({ key: 'item', traverse: true });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 40);
  });

  /** Nothing to restore to is not a reason to invent a position. */
  it('leaves the page alone on a traversal it never saw', () => {
    applyScrollPlan({ key: 'never-visited', traverse: true });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('remembers nothing when the platform names no entry', () => {
    (window as any).scrollY = 300;
    rememberScroll();

    applyScrollPlan({ key: undefined, traverse: true });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('a page that was not traversed to', () => {
  it('opens at the top', () => {
    applyScrollPlan({ traverse: false });

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('opens at the top when asked for nothing at all', () => {
    applyScrollPlan();

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  /** `scroll: 'manual'` took the anchor jump away from the browser, so it is done here. */
  it('lands on the fragment the URL asks for', () => {
    const section = document.createElement('section');
    const scrollIntoView = mock(() => {});

    section.id = 'usage';
    section.scrollIntoView = scrollIntoView;
    document.body.appendChild(section);
    history.replaceState({}, '', '/list#usage');

    applyScrollPlan({ traverse: false });

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  /** A fragment the incoming page does not render is not a reason to stay put. */
  it('falls back to the top when the fragment is not on the page', () => {
    history.replaceState({}, '', '/list#missing');

    applyScrollPlan({ traverse: false });

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  /** A remembered offset beats the fragment: the reader was already somewhere. */
  it('prefers the remembered offset over the fragment', () => {
    const section = document.createElement('section');
    const scrollIntoView = mock(() => {});

    section.id = 'usage';
    section.scrollIntoView = scrollIntoView;
    document.body.appendChild(section);
    history.replaceState({}, '', '/list#usage');
    atEntry('list');
    (window as any).scrollY = 120;
    rememberScroll();

    applyScrollPlan({ key: 'list', traverse: true });

    expect(scrollTo).toHaveBeenCalledWith(0, 120);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
