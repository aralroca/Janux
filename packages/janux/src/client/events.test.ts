import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { bool, schema, str } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from './boot';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const commits: string[] = [];

const search = component({
  name: 'search',
  state: schema({ q: str().default(''), lastKey: str().default(''), focused: bool().default(false) }),
  intents: {
    setQ: intent({
      input: schema({ value: str() }),
      run: ({ state, input }) => {
        commits.push(input.value as string);
        state.q = input.value;
      },
    }),
    onKey: intent({
      input: schema({ key: str() }),
      run: ({ state, input }) => (state.lastKey = input.key),
    }),
    setFocused: intent({
      input: schema({ focused: bool().default(true) }),
      run: ({ state, input }) => (state.focused = input.focused),
    }),
  },
  view: ({ state, intents }: any) =>
    jsx('div', {
      children: [
        jsx('input', {
          class: 'q',
          value: state.q,
          onInput: intents.setQ,
          onKeyDown: intents.onKey,
          onFocus: intents.setFocused,
        }),
        jsx('output', { children: `q=${state.q} key=${state.lastKey}` }),
      ],
    }),
});

/** SSR one component, inject its HTML + state snapshots, and resume — the shared scaffold for every suite here. */
async function serveAndBoot(def: any = search): Promise<{ client: JanuxClient; html: string }> {
  const { html, snapshots } = await renderToString(jsx(def, {}), {});
  const scripts = snapshots
    .map(
      (snap) =>
        `<script type="application/janux+state" data-uri="${snap.uri}">${JSON.stringify({ state: snap.state, sources: snap.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = html + scripts;

  return { client: boot({ defs: [def] }), html };
}

function fireInput(el: HTMLInputElement, value: string, isComposing = false): void {
  el.value = value;
  const event = new Event('input', { bubbles: true });

  Object.defineProperty(event, 'isComposing', { value: isComposing });
  el.dispatchEvent(event);
}

/**
 * A chat box, the canonical `<form intent>`: the field must empty the moment the
 * question is sent. State can't do it — a controlled write is skipped while the
 * control has focus (the no-cursor-jumps rule), and pressing Enter keeps focus —
 * so apps reached for `querySelector(...).value = ''`. `reset` is the runtime
 * doing it instead.
 */
const ask = component({
  name: 'ask',
  state: schema({ sent: str().default('') }),
  intents: {
    send: intent({ input: schema({ text: str() }), run: ({ state, input }) => (state.sent = input.text) }),
  },
  view: ({ intents }: any) =>
    jsx('form', { onSubmit: intents.send, reset: true, children: jsx('input', { name: 'text' }) }),
});

describe('rich delegated events', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    commits.length = 0;
  });

  it('a form marked reset empties itself once the intent has the values', async () => {
    const { html } = await renderToString(jsx(ask as any, {}), {});

    expect(html).toContain('data-jxreset');
    document.body.innerHTML = html;
    const client = boot({ defs: [ask] });
    const field = document.querySelector('input[name="text"]') as HTMLInputElement;

    field.value = 'invite jane@acme.com as admin';
    field.focus();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await client.settled();

    expect(((await client.read('ui://ask#default')) as any).state.sent).toBe('invite jane@acme.com as admin');
    expect(field.value).toBe('');
  });

  it('SSR emits data-jxe-* markers instead of eager listeners', async () => {
    const { html } = await renderToString(jsx(search as any, {}), {});

    expect(html).toContain('data-jxe-input="search#default:setQ"');
    expect(html).toContain('data-jxe-keydown="search#default:onKey"');
    expect(html).toContain('data-jxe-focusin="search#default:setFocused"');
  });

  it('onInput resolves to the intent with { value } from the control', async () => {
    const { client } = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    fireInput(input, 'didit');
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('q=didit');
  });

  it('suppresses input events mid-IME-composition and flushes on compositionend', async () => {
    const { client } = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    fireInput(input, 'にほ', true);
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('q= ');

    const end = new Event('compositionend', { bubbles: true });

    input.value = 'にほん';
    input.dispatchEvent(end);
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('q=にほん');
  });

  it('WebKit-order IME (compositionend then input) commits exactly once', async () => {
    const { client } = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    input.value = 'にほん';
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    await client.settled();
    fireInput(input, 'にほん');
    await client.settled();
    expect(commits).toEqual(['にほん']);
  });

  it('onKeyDown delivers keyboard facts to the intent', async () => {
    const { client } = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('key=Enter');
  });

  it('controlled input: agent-driven state change writes the DOM value when unfocused', async () => {
    const { client } = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    fireInput(input, 'x');
    await client.settled();
    await client.call('search.setQ', { value: 'from-agent' });
    await client.settled();
    expect(input.value).toBe('from-agent');
  });
});

/**
 * Any DOM event, not an allowlist: the listener for a type installs when its
 * marker is first seen — in the SSR HTML at boot, or created by an island's
 * own re-render later.
 */
const board = component({
  name: 'board',
  state: schema({ opened: bool().default(false), hovered: bool().default(false), armed: bool().default(false), spun: bool().default(false) }),
  intents: {
    open: intent({ run: ({ state }) => (state.opened = true) }),
    hover: intent({ run: ({ state }) => (state.hovered = true) }),
    arm: intent({ run: ({ state }) => (state.armed = true) }),
    spin: intent({ run: ({ state }) => (state.spun = true) }),
  },
  view: ({ state, intents }: any) =>
    jsx('div', {
      children: [
        jsx('li', { class: 'row', onDoubleClick: intents.open }),
        jsx('div', { class: 'zone', onMouseEnter: intents.hover }),
        jsx('button', { class: 'arm', onClick: intents.arm }),
        state.armed ? jsx('div', { class: 'pad', onWheel: intents.spin }) : null,
      ],
    }),
});

/** A product list, the canonical `.with()`: each row binds which product it adds. */
const shop = component({
  name: 'shop',
  state: schema({ last: str().default('') }),
  intents: {
    add: intent({ input: schema({ id: str() }), run: ({ state, input }) => (state.last = input.id) }),
  },
  view: ({ intents }: any) =>
    jsx('div', {
      children: [
        jsx('button', { class: 'p1', onClick: intents.add.with({ id: 'sneakers' }) }),
        jsx('button', { class: 'p2', onClick: intents.add.with({ id: 'boots' }) }),
      ],
    }),
});

describe('arbitrary delegated events', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('.with() input reaches the intent through the rendered data-input', async () => {
    const { client, html } = await serveAndBoot(shop);

    expect(html).toContain('data-input="{&quot;id&quot;:&quot;sneakers&quot;}"');
    document.querySelector('.p2')!.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    await client.settled();
    expect(((await client.read('ui://shop#default')) as any).state.last).toBe('boots');
  });

  it('an event outside the v0 allowlist (dblclick) resolves through its marker', async () => {
    const { client } = await serveAndBoot(board);

    document.querySelector('.row')!.dispatchEvent(new Event('dblclick', { bubbles: true }));
    await client.settled();
    expect(((await client.read('ui://board#default')) as any).state.opened).toBe(true);
  });

  it('a non-bubbling event (mouseenter) still delegates, via the capture phase', async () => {
    const { client } = await serveAndBoot(board);

    document.querySelector('.zone')!.dispatchEvent(new Event('mouseenter', { bubbles: false }));
    await client.settled();
    expect(((await client.read('ui://board#default')) as any).state.hovered).toBe(true);
  });

  it('enter/leave fire only when the marked element itself is entered — never for its children', async () => {
    const calls: string[] = [];
    const nest = component({
      name: 'nest',
      intents: { show: intent({ run: () => calls.push('show') }) },
      view: ({ intents }: any) =>
        jsx('div', { class: 'card', onMouseEnter: intents.show, children: jsx('span', { class: 'inner', children: 'x' }) }),
    });
    const { client } = await serveAndBoot(nest);

    // Entering the marked element: the browser dispatches one event per element
    // of the entered chain — only the card's own dispatch may invoke.
    document.querySelector('.card')!.dispatchEvent(new Event('mouseenter', { bubbles: false }));
    document.querySelector('.inner')!.dispatchEvent(new Event('mouseenter', { bubbles: false }));
    await client.settled();
    expect(calls).toEqual(['show']);

    // Crossing an internal boundary re-dispatches only for the child: no re-fire.
    document.querySelector('.inner')!.dispatchEvent(new Event('mouseenter', { bubbles: false }));
    await client.settled();
    expect(calls).toEqual(['show']);
  });

  it('binding onDrop enables the zone: the runtime preventDefaults dragover over the marker', async () => {
    const moves: unknown[] = [];
    const kanban = component({
      name: 'kanban',
      state: schema({ dragging: str().default('') }),
      intents: {
        pick: intent({ input: schema({ card: str() }), run: ({ state, input }) => (state.dragging = input.card) }),
        dropOn: intent({
          input: schema({ column: str() }),
          run: ({ state, input }) => moves.push(`${state.dragging}→${input.column}`),
        }),
      },
      view: ({ intents }: any) =>
        jsx('div', {
          children: [
            jsx('article', { class: 'card', draggable: true, onDragStart: intents.pick.with({ card: 'bug-7' }) }),
            jsx('section', { class: 'col', onDrop: intents.dropOn.with({ column: 'done' }), children: jsx('span', { class: 'hint', children: 'Drop here' }) }),
            jsx('section', { class: 'other', children: 'not a drop zone' }),
          ],
        }),
    });
    const { client, html } = await serveAndBoot(kanban);

    expect(html).toContain('data-jxe-dragstart="kanban#default:pick"');
    expect(html).toContain('data-jxe-drop="kanban#default:dropOn"');

    // The platform only fires `drop` if dragover was preventDefault'd — the
    // marker declares the zone, so the runtime does the enabling (also over
    // the zone's children, where the browser actually dispatches).
    const overZone = new Event('dragover', { bubbles: true, cancelable: true });
    const overChild = new Event('dragover', { bubbles: true, cancelable: true });
    const overElsewhere = new Event('dragover', { bubbles: true, cancelable: true });

    document.querySelector('.col')!.dispatchEvent(overZone);
    document.querySelector('.hint')!.dispatchEvent(overChild);
    document.querySelector('.other')!.dispatchEvent(overElsewhere);
    expect(overZone.defaultPrevented).toBe(true);
    expect(overChild.defaultPrevented).toBe(true);
    expect(overElsewhere.defaultPrevented).toBe(false);

    // The full flow: pick up (state carries the payload, not dataTransfer)…
    document.querySelector('.card')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await client.settled();
    // …then drop: the intent gets the .with() input and the browser default is cancelled.
    const drop = new Event('drop', { bubbles: true, cancelable: true });

    document.querySelector('.hint')!.dispatchEvent(drop);
    await client.settled();
    expect(moves).toEqual(['bug-7→done']);
    expect(drop.defaultPrevented).toBe(true);
  });

  it('component code can still suppress a bubbling delegated event with stopPropagation', async () => {
    const { client } = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    input.addEventListener('keydown', (event) => event.stopPropagation());
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await client.settled();
    expect(((await client.read('ui://search#default')) as any).state.lastKey).toBe('');
  });

  it('a marker first created by a client re-render gets its listener installed', async () => {
    const { client } = await serveAndBoot(board);

    expect(document.querySelector('.pad')).toBeNull();
    document.querySelector('.arm')!.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    await client.settled();
    document.querySelector('.pad')!.dispatchEvent(new Event('wheel', { bubbles: true }));
    await client.settled();
    expect(((await client.read('ui://board#default')) as any).state.spun).toBe(true);
  });
});
