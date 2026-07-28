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

  it('re-invokes function components inside identity-stable JSX (no stale skip)', () => {
    const root = document.createElement('div');
    let n = 1;
    const Dyn = () => jsx('span', { children: String(n) });
    // Hoisted, identity-stable wrapper around dynamic content — a legitimate
    // authoring pattern that must never freeze.
    const hoisted = jsx('section', { children: jsx(Dyn as any, {}) });

    render(root, [hoisted]);
    expect(root.textContent).toBe('1');
    n = 2;
    render(root, [hoisted]);
    expect(root.textContent).toBe('2');
  });

  it('syncs a select whose value and options change in the same pass', () => {
    const root = document.createElement('div');
    const sel = (value: string, options: string[]) =>
      jsx('select', {
        value,
        children: options.map((o) => jsx('option', { value: o, children: o }, o)),
      });

    render(root, sel('a', ['a']));
    const select = root.firstElementChild as HTMLSelectElement;

    render(root, sel('b', ['a', 'b']));
    expect(select.value).toBe('b');
  });

  it('sets a freshly created select to its value prop', () => {
    const root = document.createElement('div');

    render(
      root,
      jsx('select', {
        value: 'b',
        children: ['a', 'b'].map((o) => jsx('option', { value: o, children: o }, o)),
      }),
    );
    expect((root.firstElementChild as HTMLSelectElement).value).toBe('b');
  });

  it('heals textarea drift from numeric children', () => {
    const root = document.createElement('div');

    render(root, jsx('textarea', { children: 5 }));
    const area = root.firstElementChild as HTMLTextAreaElement;

    area.value = 'user typed';
    render(root, jsx('textarea', { children: 6 }));
    expect(area.value).toBe('6');
  });

  it('re-serializes when a bound intent input differs only in a children key', () => {
    const root = document.createElement('div');
    const bound = (input: Record<string, unknown>) =>
      Object.assign(() => Promise.resolve(), {
        $intent: { component: 'x', name: 'go' },
        $input: input,
      });

    render(root, jsx('a', { onClick: bound({ children: 5 }) }));
    const a = root.firstElementChild!;

    a.setAttribute('data-witness', 'kept');
    render(root, jsx('a', { onClick: bound({ children: 6 }) }));
    expect(a.hasAttribute('data-witness')).toBe(false);
  });

  it('re-serializes a style object mutated in place', () => {
    const root = document.createElement('div');
    const style: Record<string, string> = { color: 'red' };

    render(root, jsx('p', { style, children: 'x' }));
    const p = root.firstElementChild!;

    style.color = 'blue';
    render(root, jsx('p', { style, children: 'x' }));
    expect(p.getAttribute('style')).toContain('blue');
  });

  it('drops host attrs an island stops declaring', () => {
    const root = document.createElement('div');
    const island = document.createElement('janux-island');

    island.setAttribute('data-jx', 'kid#p.1.1');
    island.setAttribute('data-jx-persist', '');
    root.appendChild(island);
    const kidDef = { kind: 'ui', name: 'kid', view: () => null } as any;

    render(root, [jsx(kidDef, {})]); // no persist prop this pass
    expect(root.firstElementChild).toBe(island);
    expect(island.hasAttribute('data-jx-persist')).toBe(false);
  });

  it('skips attribute work when a fresh JSX node carries identical prop values', () => {
    const root = document.createElement('div');

    render(root, [jsx('p', { class: 'x', title: 't', children: 'static' })]);
    const p = root.firstElementChild!;

    p.setAttribute('data-witness', 'kept'); // an attr sync would remove it
    render(root, [jsx('p', { class: 'x', title: 't', children: 'static' })]);
    expect(root.firstElementChild).toBe(p);
    expect(p.getAttribute('data-witness')).toBe('kept');
  });

  it('treats equivalent bound intents as unchanged props', () => {
    const root = document.createElement('div');
    const invoke = () => Promise.resolve();
    const bound = (input: Record<string, unknown>) =>
      Object.assign(() => invoke(), {
        $intent: { component: 'bench', name: 'select' },
        $input: input,
      });

    render(root, jsx('a', { onClick: bound({ id: 7 }), children: 'row' }));
    const a = root.firstElementChild!;

    a.setAttribute('data-witness', 'kept');
    render(root, jsx('a', { onClick: bound({ id: 7 }), children: 'row' }));
    expect(a.getAttribute('data-witness')).toBe('kept');

    render(root, jsx('a', { onClick: bound({ id: 8 }), children: 'row' }));
    expect(a.hasAttribute('data-witness')).toBe(false);
  });

  it('still syncs value controls when props are value-equal', () => {
    const root = document.createElement('div');

    render(root, jsx('input', { value: 'state' }));
    const input = root.firstElementChild as HTMLInputElement;

    input.value = 'drifted'; // unfocused DOM drift, state unchanged
    render(root, jsx('input', { value: 'state' }));
    expect(input.value).toBe('state');
  });

  it('moves a single displaced keyed row with one insertion, not a cascade', () => {
    const root = document.createElement('ul');
    const rows = (order: number[]) => order.map((id) => jsx('li', { children: `r${id}` }, id));

    render(root, rows([1, 2, 3, 4, 5]));
    const inserts: string[] = [];
    const original = root.insertBefore.bind(root);

    (root as any).insertBefore = (node: Node, ref: Node | null) => {
      inserts.push(node.textContent ?? '?');

      return original(node, ref);
    };
    render(root, rows([1, 5, 2, 3, 4]));
    expect([...root.children].map((el) => el.textContent)).toEqual(['r1', 'r5', 'r2', 'r3', 'r4']);
    expect(inserts).toEqual(['r5']);
  });

  it('rotates a keyed list with one move, not a cascade (LIS ordering)', () => {
    const root = document.createElement('ul');
    const rows = (order: number[]) => order.map((id) => jsx('li', { children: `r${id}` }, id));

    render(root, rows([1, 2, 3, 4, 5]));
    const inserts: string[] = [];
    const original = root.insertBefore.bind(root);

    (root as any).insertBefore = (node: Node, ref: Node | null) => {
      inserts.push(node.textContent ?? '?');

      return original(node, ref);
    };
    render(root, rows([2, 3, 4, 5, 1]));
    expect([...root.children].map((el) => el.textContent)).toEqual(['r2', 'r3', 'r4', 'r5', 'r1']);
    expect(inserts).toEqual(['r1']);
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
