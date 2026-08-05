import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { CURSOR_ID, enableAgentCursor, injectCursorStyles, moveCursorTo } from './cursor';
import { suspendAgentGlow } from './glow';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

/** Same island shape the glow suite uses: one intent per control. */
const ISLAND = `
  <janux-island data-jx="users#default">
    <input id="q" data-jxe-input="users#default:search" />
    <button data-jxa="users#default:clear">clear</button>
  </janux-island>`;

function rectAt(left: number, top: number, width: number, height: number): () => DOMRect {
  return () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
}

function cursorEl(): HTMLElement {
  return document.getElementById(CURSOR_ID)!;
}

describe('agent cursor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('installs its stylesheet once, overridable via --janux-cursor-* vars', () => {
    injectCursorStyles();
    injectCursorStyles();

    expect(document.querySelectorAll('#janux-cursor-styles')).toHaveLength(1);
    expect(document.getElementById('janux-cursor-styles')!.textContent).toContain('--janux-cursor-halo');
  });

  it('travels to the element center and shows the arrow', () => {
    document.body.innerHTML = '<button>hi</button>';
    const button = document.querySelector('button')!;

    button.getBoundingClientRect = rectAt(100, 200, 40, 20);
    moveCursorTo(button);

    expect(cursorEl().classList.contains('on')).toBe(true);
    expect(cursorEl().style.transform).toBe('translate(120px, 210px)');
    // Marked to survive SPA navigations — the document diff drops unmarked body extras.
    expect(cursorEl().hasAttribute('data-janux-keep')).toBe(true);
  });

  it('fades out after the linger duration', async () => {
    document.body.innerHTML = '<button>hi</button>';

    moveCursorTo(document.querySelector('button')!, 10);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(cursorEl().classList.contains('on')).toBe(false);
  });

  it('follows janux:tool-call to the intent control, with the glow target rules', () => {
    document.body.innerHTML = ISLAND;
    const dispose = enableAgentCursor();
    const clear = document.querySelector('button')!;

    clear.getBoundingClientRect = rectAt(10, 20, 20, 10);
    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'start' } }));

    expect(cursorEl().style.transform).toBe('translate(20px, 25px)');
    dispose();
  });

  it('stays put on confirm-guarded proposals and on non-start phases', () => {
    document.body.innerHTML = ISLAND;
    const dispose = enableAgentCursor();

    document.dispatchEvent(
      new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'start', guard: 'confirm' } }),
    );
    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'ok' } }));

    expect(document.getElementById(CURSOR_ID)).toBeNull();
    dispose();
  });

  it('follows janux:tool-target to the DOM-fallback element', () => {
    document.body.innerHTML = '<input id="street" />';
    const dispose = enableAgentCursor();
    const input = document.getElementById('street')!;

    input.getBoundingClientRect = rectAt(50, 60, 100, 30);
    document.dispatchEvent(
      new CustomEvent('janux:tool-target', { detail: { element: input, action: 'fill', selector: '#street' } }),
    );

    expect(cursorEl().style.transform).toBe('translate(100px, 75px)');
    dispose();
  });

  it('stands down while a richer visualizer holds the suspension, like the glow does', () => {
    document.body.innerHTML = ISLAND;
    const dispose = enableAgentCursor();
    const resume = suspendAgentGlow();

    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'start' } }));
    expect(document.getElementById(CURSOR_ID)).toBeNull();
    resume();

    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'start' } }));
    expect(document.getElementById(CURSOR_ID)).not.toBeNull();
    dispose();
  });

  it('disposing removes the overlay and stops listening', () => {
    document.body.innerHTML = ISLAND;
    const dispose = enableAgentCursor();

    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'start' } }));
    expect(document.getElementById(CURSOR_ID)).not.toBeNull();
    dispose();

    expect(document.getElementById(CURSOR_ID)).toBeNull();
    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'users.clear', phase: 'start' } }));
    expect(document.getElementById(CURSOR_ID)).toBeNull();
  });
});
