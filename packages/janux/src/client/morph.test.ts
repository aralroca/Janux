import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://app.test/' });

const { toDomNodes } = await import('./dom');
const { morph } = await import('./morph');
const { jsx } = await import('../jsx-runtime');

afterAll(() => GlobalRegistrator.unregister());

const row = (id: number, label: string) =>
  jsx('tr', { children: jsx('td', { children: label }) }, id);

function renderRows(root: Element, rows: [number, string][]): Map<number, Element> {
  morph(root, toDomNodes(rows.map(([id, label]) => row(id, label))) as Node[]);

  return new Map(rows.map(([id], index) => [id, root.children[index]!]));
}

describe('keyed morph', () => {
  it('moves existing nodes across a permutation instead of rewriting them', () => {
    const root = document.createElement('tbody');
    const before = renderRows(root, [[1, 'one'], [2, 'two'], [3, 'three']]);

    renderRows(root, [[3, 'three'], [1, 'one'], [2, 'two']]);
    expect(root.children[0]).toBe(before.get(3)!);
    expect(root.children[1]).toBe(before.get(1)!);
    expect(root.children[2]).toBe(before.get(2)!);
  });

  it('keeps survivor identity when keyed siblings are removed', () => {
    const root = document.createElement('tbody');
    const before = renderRows(root, [[1, 'one'], [2, 'two'], [3, 'three']]);

    renderRows(root, [[3, 'three']]);
    expect(root.children.length).toBe(1);
    expect(root.children[0]).toBe(before.get(3)!);
  });

  it('keeps survivor identity when new keyed rows are inserted in front', () => {
    const root = document.createElement('tbody');
    const before = renderRows(root, [[1, 'one'], [2, 'two']]);

    renderRows(root, [[9, 'nine'], [1, 'one'], [2, 'two']]);
    expect(root.children[1]).toBe(before.get(1)!);
    expect(root.children[2]).toBe(before.get(2)!);
    expect(root.children[0]!.textContent).toBe('nine');
  });

  it('adopts unkeyed resumed DOM by position on the first keyed render', () => {
    const root = document.createElement('tbody');

    // SSR-shaped markup: same tags, no client-side keys yet.
    root.innerHTML = '<tr><td>one</td></tr><tr><td>two</td></tr>';
    const [ssrFirst, ssrSecond] = [...root.children];

    const byId = renderRows(root, [[1, 'one'], [2, 'two']]);

    expect(byId.get(1)!).toBe(ssrFirst!);
    expect(byId.get(2)!).toBe(ssrSecond!);

    // …and from then on the adopted nodes move by key like any keyed row.
    renderRows(root, [[2, 'two'], [1, 'one']]);
    expect(root.children[0]).toBe(ssrSecond!);
    expect(root.children[1]).toBe(ssrFirst!);
  });
});
