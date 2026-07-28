import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://app.test/' });

const { reconcile } = await import('./reconcile');
const { jsx } = await import('../jsx-runtime');
const { Fragment } = await import('../jsx-runtime');

afterAll(() => GlobalRegistrator.unregister());

const pass = () => ({
  parent: { name: 'p', key: '1' },
  seq: new Map(),
  used: new Set<string>(),
  islands: [] as any[],
  foreigns: [] as any[],
});

function render(root: Element, tree: unknown) {
  reconcile(root, tree, pass());
}

describe('reconcile', () => {
  it('reuses the live element and only rewrites what changed', () => {
    const root = document.createElement('div');

    render(root, jsx('p', { class: 'a', title: 't', children: 'one' }));
    const p = root.firstElementChild!;

    render(root, jsx('p', { class: 'b', children: 'two' }));
    expect(root.firstElementChild).toBe(p);
    expect(p.className).toBe('b');
    expect(p.hasAttribute('title')).toBe(false);
    expect(p.textContent).toBe('two');
  });

  it('preserves runtime janux-* classes across a re-render', () => {
    const root = document.createElement('div');

    render(root, jsx('p', { class: 'a', children: 'x' }));
    root.firstElementChild!.classList.add('janux-glow');
    render(root, jsx('p', { class: 'b', children: 'x' }));
    expect(root.firstElementChild!.classList.contains('janux-glow')).toBe(true);
    expect(root.firstElementChild!.classList.contains('b')).toBe(true);
  });

  it('moves keyed rows across a permutation instead of rewriting them', () => {
    const root = document.createElement('tbody');
    const rows = (order: number[]) =>
      order.map((id) => jsx('tr', { children: jsx('td', { children: `r${id}` }) }, id));

    render(root, rows([1, 2, 3]));
    const [first, second, third] = [...root.children];

    render(root, rows([3, 1, 2]));
    expect(root.children[0]).toBe(third!);
    expect(root.children[1]).toBe(first!);
    expect(root.children[2]).toBe(second!);
  });

  it('flattens fragments, arrays and function components like toDomNodes', () => {
    const root = document.createElement('div');
    const Item = (props: any) => jsx('li', { children: props.label });

    render(
      root,
      jsx(Fragment as any, {
        children: [jsx(Item as any, { label: 'a' }), [jsx(Item as any, { label: 'b' })], 'tail'],
      }),
    );
    expect(root.innerHTML).toBe('<li>a</li><li>b</li>tail');
  });

  it('updates text nodes in place', () => {
    const root = document.createElement('div');

    render(root, ['count: ', 1]);
    const text = root.childNodes[1]!;

    render(root, ['count: ', 2]);
    expect(root.childNodes[1]).toBe(text);
    expect(root.textContent).toBe('count: 2');
  });

  it('never touches the focused control and syncs unfocused values as properties', () => {
    const root = document.createElement('div');

    document.body.appendChild(root);
    render(root, jsx('input', { value: 'server' }));
    const input = root.firstElementChild as HTMLInputElement;

    input.value = 'typed';
    input.focus();
    render(root, jsx('input', { value: 'state' }));
    expect(input.value).toBe('typed');
    input.blur();
    render(root, jsx('input', { value: 'state2' }));
    expect(input.value).toBe('state2');
    document.body.removeChild(root);
  });

  it('syncs checkboxes through the checked property', () => {
    const root = document.createElement('div');

    render(root, jsx('input', { type: 'checkbox', checked: false }));
    const box = root.firstElementChild as HTMLInputElement;

    box.checked = true; // user toggles
    render(root, jsx('input', { type: 'checkbox', checked: false }));
    expect(box.checked).toBe(false);
  });

  it('treats island hosts as opaque and reuses them by id across moves', () => {
    const root = document.createElement('div');
    const island = document.createElement('janux-island');

    island.setAttribute('data-jx', 'child#p.1.1');
    island.innerHTML = '<span>island interior</span>';
    root.appendChild(island);

    const childDef = { kind: 'ui', name: 'child', view: () => null } as any;

    render(root, [jsx('p', { children: 'before' }), jsx(childDef, {})]);
    expect(root.children[1]).toBe(island);
    expect(island.innerHTML).toBe('<span>island interior</span>');
  });

  it('creates svg subtrees in the SVG namespace', () => {
    const root = document.createElement('div');

    render(root, jsx('svg', { children: jsx('path', { d: 'M0 0' }) }));
    expect(root.firstElementChild!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(root.firstElementChild!.firstElementChild!.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('skips an identical JSX node entirely (memoization seam)', () => {
    const root = document.createElement('div');
    const stable = jsx('p', { class: 'x', children: 'static' });

    render(root, [stable]);
    const p = root.firstElementChild!;

    p.setAttribute('data-witness', 'kept'); // would be wiped by an attr sync
    render(root, [stable]);
    expect(root.firstElementChild).toBe(p);
    expect(p.getAttribute('data-witness')).toBe('kept');
  });

  it('applies dangerHTML only when it changed', () => {
    const root = document.createElement('div');

    render(root, jsx('div', { dangerHTML: '<b>hi</b>' }));
    const container = root.firstElementChild!;
    const bold = container.firstElementChild!;

    render(root, jsx('div', { dangerHTML: '<b>hi</b>' }));
    expect(container.firstElementChild).toBe(bold);
    render(root, jsx('div', { dangerHTML: '<i>bye</i>' }));
    expect(container.innerHTML).toBe('<i>bye</i>');
  });
});
