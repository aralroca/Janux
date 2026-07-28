import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://app.test/' });

const { toDomNodes } = await import('./dom');
const { jsx } = await import('../jsx-runtime');

afterAll(() => GlobalRegistrator.unregister());

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

describe('toDomNodes', () => {
  /**
   * Regression: a close icon in a client-rendered panel was invisible.
   * `createElement('svg')` builds an unknown HTML element, and unknown elements
   * lay out as nothing — the markup looked correct in devtools either way.
   */
  it('builds svg subtrees in the SVG namespace', () => {
    const icon = jsx('svg', { viewBox: '0 0 16 16', children: jsx('path', { d: 'M4 4l8 8' }) });
    const [svg] = toDomNodes(icon) as Element[];

    expect(svg!.namespaceURI).toBe(SVG_NS);
    expect(svg!.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg!.firstElementChild!.namespaceURI).toBe(SVG_NS);
    expect(svg!.firstElementChild!.tagName).toBe('path');
  });

  it('serializes a style object to CSS text, mirroring SSR', () => {
    const node = jsx('div', { style: { backgroundColor: 'red', '--x': '1px' } });
    const [div] = toDomNodes(node) as Element[];

    expect(div!.getAttribute('style')).toBe('background-color:red;--x:1px');
  });

  it('stringifies aria-* booleans, mirroring SSR', () => {
    const node = jsx('button', { 'aria-selected': true, 'aria-expanded': false });
    const [button] = toDomNodes(node) as Element[];

    expect(button!.getAttribute('aria-selected')).toBe('true');
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });

  it('stringifies enumerated booleans and drops malformed names, mirroring SSR', () => {
    const node = jsx('img', { draggable: false, 'aria-x" onmouseover="alert(1)': true });
    const [img] = toDomNodes(node) as Element[];

    expect(img!.getAttribute('draggable')).toBe('false');
    expect(img!.attributes.length).toBe(1);
  });

  it('keeps html elements in the HTML namespace', () => {
    const [button] = toDomNodes(jsx('button', { children: 'Close' })) as Element[];

    expect(button!.namespaceURI).toBe(HTML_NS);
  });

  it('returns to HTML inside foreignObject', () => {
    const chart = jsx('svg', {
      children: jsx('foreignObject', { children: jsx('div', { children: 'label' }) }),
    });
    const [svg] = toDomNodes(chart) as Element[];
    const foreign = svg!.firstElementChild!;

    expect(foreign.namespaceURI).toBe(SVG_NS);
    expect(foreign.firstElementChild!.namespaceURI).toBe(HTML_NS);
  });
});
