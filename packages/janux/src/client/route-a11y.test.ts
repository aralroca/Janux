import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { KEEP_ATTRIBUTE } from './navigate';
import { announceRoute, routeTitle, saveWidgetFocus, settleRouteA11y } from './route-a11y';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/docs/quick-start' }));
afterAll(() => GlobalRegistrator.unregister());

const ANNOUNCER = '#janux-route-announcer';
const ANNOUNCE_DELAY_MS = 60;

const announcer = () => document.querySelector(ANNOUNCER) as HTMLElement | null;
const settled = () => Bun.sleep(ANNOUNCE_DELAY_MS * 2);

function renderPage(body: string, title = 'Quick start | Janux'): void {
  document.title = title;
  document.body.innerHTML = body;
}

beforeEach(() => {
  renderPage('');
  document.querySelectorAll(ANNOUNCER).forEach((node) => node.remove());
});

describe('route announcer', () => {
  it('announces the document title in an assertive, atomic live region', async () => {
    renderPage('<main><h1>Quick start</h1></main>');
    announceRoute();
    await settled();

    const region = announcer()!;

    expect(region.tagName).toBe('P');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toBe('Quick start | Janux');
  });

  /** A `role` would carry its own implicit politeness and fight `aria-live`. */
  it('carries no role of its own', () => {
    announceRoute();

    expect(announcer()!.hasAttribute('role')).toBe(false);
  });

  /** Without the keep marker the whole-document diff owns it and the next page deletes it. */
  it('marks itself as a session node the navigation diff must not own', () => {
    announceRoute();

    expect(announcer()!.hasAttribute(KEEP_ATTRIBUTE)).toBe(true);
  });

  it('is taken out of the flow and clipped, so it is neither visible nor takes space', () => {
    announceRoute();

    const style = announcer()!.getAttribute('style') ?? '';

    expect(style).toContain('position:absolute');
    expect(style).toContain('width:1px');
    expect(style).toContain('height:1px');
    expect(style).toContain('clip:rect(0 0 0 0)');
    // Off-screen text that wraps gets smushed into the 1px box and read wrong.
    expect(style).toContain('white-space:nowrap');
  });

  it('reuses the same region across navigations instead of stacking one per page', async () => {
    announceRoute();
    await settled();
    announceRoute();
    await settled();

    expect(document.querySelectorAll(ANNOUNCER).length).toBe(1);
  });

  /**
   * A live region speaks when its content CHANGES. Two pages sharing a title
   * would be silent if the text were simply reassigned, so it is emptied first.
   */
  it('empties the region before filling it, so a repeated title still speaks', async () => {
    announceRoute();
    await settled();
    announceRoute();

    expect(announcer()!.textContent).toBe('');
    await settled();
    expect(announcer()!.textContent).toBe('Quick start | Janux');
  });

  describe('what it reads', () => {
    it('prefers the document title', () => {
      renderPage('<h1>Heading</h1>', 'Title');

      expect(routeTitle()).toBe('Title');
    });

    it('falls back to the heading when the route ships no title', () => {
      renderPage('<h1>  Heading  </h1>', '');

      expect(routeTitle()).toBe('Heading');
    });

    it('falls back to the path when the route ships neither', () => {
      renderPage('<p>no heading</p>', '');

      expect(routeTitle()).toBe('/docs/quick-start');
    });
  });
});

describe('focus after a navigation', () => {
  it('moves focus to the new page heading, made focusable without entering the tab order', () => {
    renderPage('<main><h1>Quick start</h1></main>');
    settleRouteA11y();

    const heading = document.querySelector('h1')!;

    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('falls back to the main content container when the route has no heading', () => {
    renderPage('<main><p>Content</p></main>');
    settleRouteA11y();

    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('prefers the heading over the container that wraps it', () => {
    renderPage('<main><h1>Quick start</h1></main>');
    settleRouteA11y();

    expect((document.activeElement as HTMLElement).tagName).toBe('H1');
  });

  it('leaves focus alone when the page offers nothing to focus', () => {
    renderPage('<div>bare</div>');
    settleRouteA11y();

    expect(document.activeElement).toBe(document.body);
  });
});

describe('focus inside a widget that manages its own', () => {
  function openWidget(markup = '<input value="hello world" />'): HTMLInputElement {
    renderPage(`<main><h1>Quick start</h1></main><janux-island data-jx-persist>${markup}</janux-island>`);
    const field = document.querySelector('input') as HTMLInputElement;

    field.focus();

    return field;
  }

  it('is not stolen: focus and caret go back to the widget, not to the new heading', () => {
    const field = openWidget();

    field.setSelectionRange(2, 5);
    const saved = saveWidgetFocus()!;

    // What the navigation does to a persisted island: lifted out of the
    // document before the diff, grafted back after it. Removing it blurs.
    const island = document.querySelector('janux-island')!;

    island.remove();
    expect(document.activeElement).toBe(document.body);
    document.body.appendChild(island);
    settleRouteA11y(saved);

    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(5);
    expect(document.querySelector('h1')!.hasAttribute('tabindex')).toBe(false);
  });

  it('still announces the new page: the page did change', async () => {
    const field = openWidget();
    const saved = saveWidgetFocus()!;

    settleRouteA11y(saved);
    await settled();

    expect(document.activeElement).toBe(field);
    expect(announcer()!.textContent).toBe('Quick start | Janux');
  });

  it('ignores focus that is not inside a persisted widget', () => {
    renderPage('<main><h1>Quick start</h1><input /></main>');
    (document.querySelector('input') as HTMLInputElement).focus();

    expect(saveWidgetFocus()).toBeUndefined();
  });

  it('reports no focus to restore when nothing is focused', () => {
    renderPage('<main><h1>Quick start</h1></main>');

    expect(saveWidgetFocus()).toBeUndefined();
  });

  /**
   * A persisted island the incoming page does not render is disposed, and the
   * saved focus goes with it. Leaving focus on `<body>` would be the very bug
   * this module exists to fix, so it falls back to the new page's content.
   */
  it('falls back to the new content when the widget did not survive the navigation', () => {
    const field = openWidget();
    const saved = saveWidgetFocus()!;

    document.querySelector('janux-island')!.remove();
    settleRouteA11y(saved);

    expect(field.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('h1'));
  });

  /** `setSelectionRange` throws on inputs that do not support selection. */
  it('restores focus without a caret on an input that has no selection', () => {
    const field = openWidget('<input type="number" value="7" />');
    const saved = saveWidgetFocus()!;

    expect(saved.start).toBeNull();
    expect(() => settleRouteA11y(saved)).not.toThrow();
    expect(document.activeElement).toBe(field);
  });
});
