import { describe, expect, it } from 'bun:test';
import { component, createInstance, int, intent, jsx, renderToString, schema, str } from 'janux';

/**
 * guide/components.md and guide/schema.md: the three rules the page says the
 * framework *enforces* (schema-typed state, mutations only inside run, no
 * domain state in views), plus the nested-island semantics it promises —
 * namespaced ids, independent updates and a fresh instance after re-adding.
 */

const Card = component({
  name: 'card',
  description: 'One card',
  state: schema({ label: str().default('empty') }),
  intents: {
    rename: intent({
      description: 'Rename the card',
      input: schema({ label: str() }),
      run: ({ state, input }: any) => (state.label = input.label),
    }),
  },
  view: ({ state }: any) => jsx('article', { children: state.label }),
});

const Board = component({
  name: 'board',
  description: 'A board of cards',
  state: schema({ cards: int().default(2) }),
  intents: {
    add: intent({ description: 'Add a card', run: ({ state }: any) => (state.cards += 1) }),
    remove: intent({ description: 'Remove a card', run: ({ state }: any) => (state.cards -= 1) }),
  },
  view: ({ state, intents }: any) =>
    jsx('section', {
      children: [
        jsx('button', { on: intents.add, children: '+ card' }),
        ...Array.from({ length: state.cards }, (_, index) => jsx(Card as any, { key: `c${index}` })),
      ],
    }),
});

describe('guide/components.md — rules the framework enforces', () => {
  it('a mutation outside run() throws', async () => {
    const instance = createInstance(Card);

    await instance.attach();

    expect(() => {
      (instance.state as any).label = 'sneaky';
    }).toThrow();
    await instance.intents.rename({ label: 'legit' }); // inside run: fine

    expect(instance.snapshot().label).toBe('legit');
  });

  it('state is serializable by construction: the snapshot round-trips as JSON', async () => {
    const instance = createInstance(Board);

    await instance.attach();
    await instance.intents.add();

    expect(JSON.parse(JSON.stringify(instance.snapshot()))).toEqual({ cards: 3 });
  });

  it('a static component ships no island wrapper and no script', async () => {
    const Badge = ({ label }: { label: string }) => jsx('span', { class: 'badge', children: label });
    const { html, snapshots } = await renderToString(jsx(Badge as any, { label: 'new' }), {});

    expect(html).toBe('<span class="badge">new</span>');
    expect(snapshots).toEqual([]);
  });
});

describe('guide/components.md — nested islands', () => {
  it('namespaces a child id by its parent, identically on every render', async () => {
    const first = await renderToString(jsx(Board as any, {}), {});
    const second = await renderToString(jsx(Board as any, {}), {});
    const ids = (html: string) => [...html.matchAll(/data-jx="([^"]+)"/g)].map((match) => match[1]);

    expect(ids(first.html)).toEqual(['board#default', 'card#board.default.c0', 'card#board.default.c1']);
    expect(ids(second.html)).toEqual(ids(first.html)); // deterministic identity
  });

  it('gives every nested island its own resource uri', async () => {
    const { snapshots } = await renderToString(jsx(Board as any, {}), {});

    expect(snapshots.map((snapshot: any) => snapshot.uri).sort()).toEqual([
      'ui://board#default',
      'ui://card#board.default.c0',
      'ui://card#board.default.c1',
    ]);
  });

  it('drops a child when the parent stops rendering it, and re-adds a fresh one', async () => {
    const withThree = await renderToString(jsx(Board as any, { initial: { cards: 3 } }), {});

    expect(withThree.snapshots).toHaveLength(4);
    const withOne = await renderToString(jsx(Board as any, { initial: { cards: 1 } }), {});

    expect(withOne.snapshots.map((snapshot: any) => snapshot.uri)).toEqual(['ui://board#default', 'ui://card#board.default.c0']);
    expect((withOne.snapshots[1] as any).state).toEqual({ label: 'empty' }); // fresh, default state
  });
});
