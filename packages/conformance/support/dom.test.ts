import { describe, expect, it } from 'bun:test';
import { resetDocument, useDom } from './dom';

/**
 * Guards the corpus performance budget: Happy-DOM registration is the expensive
 * part of a DOM test file, so the corpus pays it once per file and reuses the
 * window across describes. If this file ever gets slow, the corpus is
 * re-registering somewhere it shouldn't.
 */

useDom();

describe('useDom', () => {
  it('exposes a document', () => {
    expect(typeof document).toBe('object');
  });

  it('mounts and tears down 200 trees well under the per-file budget', () => {
    const started = performance.now();

    Array.from({ length: 200 }, (_, index) => mountThrowaway(index));

    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe('resetDocument', () => {
  it('clears body, head and the html attributes a previous describe set', () => {
    document.body.innerHTML = '<p>left over</p>';
    document.head.innerHTML = '<style>p{color:red}</style>';
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');

    resetDocument();

    expect(document.body.innerHTML).toBe('');
    expect(document.head.innerHTML).toBe('');
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
    expect(document.documentElement.hasAttribute('lang')).toBe(false);
  });
});

function mountThrowaway(index: number): void {
  const host = document.createElement('section');

  host.innerHTML = `<ul><li>item ${index}</li></ul>`;
  document.body.append(host);
  host.remove();
}
