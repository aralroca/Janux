import { describe, expect, it } from 'bun:test';
import { compileBindingSites, compileClientModule } from './binding-sites';

/**
 * The compile-time binding maps of the roadmap's compiler evolution: a JSX
 * site that is a pure static read of a schema-typed state path is rewritten
 * into a reactive binding thunk (`{state.count}` → `{() => (state.count)}`),
 * the shape the runtime already gives its own per-slot effect (#17 in the
 * benchmark log). The view then stops subscribing to that read, so a write
 * re-runs one DOM write instead of one island render. Everything the
 * compiler cannot PROVE equivalent stays untouched — the transform fails
 * open, site by site, and a module with no provable site is left alone.
 */

const HEADER = `import { component, schema, str, int, bool, enums, obj, list, intent } from 'janux';\n`;

function island(fields: string): string {
  return `${HEADER}export const Card = component({
  name: 'card',
  ${fields}
});\n`;
}

describe('compileBindingSites', () => {
  it('rewrites a text site whose path is schema-typed string or number', () => {
    const code = island(`state: schema({ count: int().default(0) }),
  view: ({ state }: any) => <span>{state.count}</span>,`);

    expect(compileBindingSites(code, true)).toContain('<span>{() => (state.count)}</span>');
  });

  it('rewrites an attribute site on a native element', () => {
    const code = island(`state: schema({ label: str() }),
  view: ({ state }: any) => <div data-label={state.label}>x</div>,`);

    expect(compileBindingSites(code, true)).toContain('data-label={() => (state.label)}');
  });

  it('resolves nested obj() paths and enums()', () => {
    const code = island(`state: schema({ user: obj({ name: str() }), tone: enums(['a', 'b']) }),
  view: ({ state }: any) => (
    <section data-tone={state.tone}>
      <b>{state.user.name}</b>
    </section>
  ),`);
    const out = compileBindingSites(code, true);

    expect(out).toContain('data-tone={() => (state.tone)}');
    expect(out).toContain('<b>{() => (state.user.name)}</b>');
  });

  it('leaves the rest of the module byte-for-byte intact', () => {
    const code = island(`state: schema({ count: int() }),
  view: ({ state }: any) => <span>{state.count}</span>,`);

    expect(compileBindingSites(code, true)).toBe(
      island(`state: schema({ count: int() }),
  view: ({ state }: any) => <span>{() => (state.count)}</span>,`),
    );
  });

  /**
   * JSX drops null/undefined/boolean in text position while a thunk renders
   * them through `textOf` — so only paths the schema types as non-nullable
   * string/number are provably equivalent as text.
   */
  it('does not touch a text site whose path is boolean, optional or nullable', () => {
    const bool$ = island(`state: schema({ on: bool() }),
  view: ({ state }: any) => <span>{state.on}</span>,`);
    const optional = island(`state: schema({ note: str().optional() }),
  view: ({ state }: any) => <span>{state.note}</span>,`);
    const nullable = island(`state: schema({ note: str().nullable() }),
  view: ({ state }: any) => <span>{state.note}</span>,`);

    expect(compileBindingSites(bool$, true)).toBeUndefined();
    expect(compileBindingSites(optional, true)).toBeUndefined();
    expect(compileBindingSites(nullable, true)).toBeUndefined();
  });

  /**
   * The HTML parser merges adjacent SSR text into ONE Text node; a binding
   * adopting it would claim the merged content. A text site is only provable
   * when its rendered siblings cannot be text.
   */
  it('does not touch a text site with adjacent rendered text', () => {
    const code = island(`state: schema({ count: int() }),
  view: ({ state }: any) => <span>{state.count} items</span>,`);

    expect(compileBindingSites(code, true)).toBeUndefined();
  });

  it('still rewrites when the only siblings are elements or droppable whitespace', () => {
    const code = island(`state: schema({ count: int() }),
  view: ({ state }: any) => (
    <p>
      <em>total</em>
      {state.count}
    </p>
  ),`);

    expect(compileBindingSites(code, true)).toContain('{() => (state.count)}');
  });

  /** A component prop is data, not an attribute — a thunk would change what the component receives. */
  it('does not touch props of function components', () => {
    const code = `${HEADER}function Chip({ label }: any) { return <i>{label}</i>; }
export const Card = component({
  name: 'card',
  state: schema({ label: str() }),
  view: ({ state }: any) => <Chip label={state.label} />,
});\n`;

    expect(compileBindingSites(code, true)).toBeUndefined();
  });

  it('does not touch event props, and binds value like the runtime already can', () => {
    const events = island(`state: schema({ label: str() }),
  intents: { go: intent({ run: () => {} }) },
  view: ({ state, intents }: any) => <button onClick={intents.go}>{state.label}</button>,`);
    const value = island(`state: schema({ text: str() }),
  view: ({ state }: any) => <input value={state.text} />,`);

    expect(compileBindingSites(events, true)).toContain('{() => (state.label)}');
    expect(compileBindingSites(events, true)).toContain('onClick={intents.go}');
    expect(compileBindingSites(value, true)).toContain('value={() => (state.text)}');
  });

  /**
   * Attribute position is the lax case: absent-for-falsy and the aria
   * "true"/"false" stringification are identical for a static value and a
   * resolved thunk, so ANY leaf builder qualifies — modifiers included.
   * Text position stays strict (JSX drops what textOf renders).
   */
  it('rewrites boolean and optional paths in attribute position only', () => {
    const boolAttr = island(`state: schema({ on: bool() }),
  view: ({ state }: any) => <div aria-busy={state.on} hidden={state.on}>x</div>,`);
    const optional = island(`state: schema({ note: str().optional() }),
  view: ({ state }: any) => <p data-note={state.note}>x</p>,`);
    const objAttr = island(`state: schema({ user: obj({ name: str() }) }),
  view: ({ state }: any) => <p data-user={state.user}>x</p>,`);
    const out = compileBindingSites(boolAttr, true);

    expect(out).toContain('aria-busy={() => (state.on)}');
    expect(out).toContain('hidden={() => (state.on)}');
    expect(compileBindingSites(optional, true)).toContain('data-note={() => (state.note)}');
    // A container is not a leaf: nothing proves how it serializes.
    expect(compileBindingSites(objAttr, true)).toBeUndefined();
  });

  it('does not touch calls or any other non-path expression', () => {
    const call = island(`state: schema({ label: str() }),
  view: ({ state }: any) => <span>{state.label.trim()}</span>,`);
    const literal = island(`state: schema({ items: list(str()) }),
  view: ({ state }: any) => <span>{state.items[0]}</span>,`);

    expect(compileBindingSites(call, true)).toBeUndefined();
    // A literal index over a list() resolves through the item type.
    expect(compileBindingSites(literal, true)).toContain('<span>{() => (state.items[0])}</span>');
  });

  /**
   * The controlled-form shape (regression #22): the hot sites live inside
   * the `.map()` callback and index a `list()` by the callback's parameter.
   * The wrap only DEFERS evaluation, so the index must be provably stable —
   * a parameter or const nothing in the module ever reassigns.
   */
  it('rewrites list sites indexed by a stable identifier inside a map callback', () => {
    const code = `${HEADER}const FIELDS = [0, 1, 2];
export const Card = component({
  name: 'card',
  state: schema({ values: list(str()) }),
  view: ({ state }: any) => (
    <form>
      {FIELDS.map((index: number) => (
        <label>
          <input value={state.values[index]} />
          <output>{state.values[index]}</output>
        </label>
      ))}
    </form>
  ),
});\n`;
    const out = compileBindingSites(code, true);

    expect(out).toContain('value={() => (state.values[index])}');
    expect(out).toContain('<output>{() => (state.values[index])}</output>');
  });

  it('descends into list item shapes and rewrites checked for a bool leaf', () => {
    const rows = island(`state: schema({ rows: list(obj({ label: str() })) }),
  view: ({ state }: any) => <ul>{[0].map((i: number) => <li>{state.rows[i].label}</li>)}</ul>,`);
    const checked = island(`state: schema({ on: bool() }),
  view: ({ state }: any) => <input type="checkbox" checked={state.on} />,`);

    expect(compileBindingSites(rows, true)).toContain('<li>{() => (state.rows[i].label)}</li>');
    expect(compileBindingSites(checked, true)).toContain('checked={() => (state.on)}');
  });

  it('does not defer an index anything in the module reassigns, or a var', () => {
    const reassigned = island(`state: schema({ values: list(str()) }),
  view: ({ state }: any) => { let i = 0; i += 1; return <output>{state.values[i]}</output>; },`);
    const varred = island(`state: schema({ values: list(str()) }),
  view: ({ state }: any) => { var i = 0; return <output>{state.values[i]}</output>; },`);
    const updated = `${HEADER}let cursor = 0;
export function advance() { cursor++; }
export const Card = component({
  name: 'card',
  state: schema({ values: list(str()) }),
  view: ({ state }: any) => <output>{state.values[cursor]}</output>,
});\n`;

    expect(compileBindingSites(reassigned, true)).toBeUndefined();
    expect(compileBindingSites(varred, true)).toBeUndefined();
    expect(compileBindingSites(updated, true)).toBeUndefined();
  });

  /** A computed key over an obj() shape proves nothing about the leaf. */
  it('does not touch computed keys over object shapes', () => {
    const code = island(`state: schema({ user: obj({ name: str() }) }),
  view: ({ state }: any) => <output>{state.user[key]}</output>,`);

    expect(compileBindingSites(code, true)).toBeUndefined();
  });

  it('bails out of a view that shadows or aliases `state`', () => {
    const shadow = island(`state: schema({ label: str() }),
  view: ({ state }: any) => { const render = (state: any) => <b>{state.label}</b>; return <span>{state.label}</span>; },`);
    const alias = `${HEADER}export const Card = component({
  name: 'card',
  state: schema({ label: str() }),
  view: (bag: any) => <span>{bag.state.label}</span>,
});\n`;

    expect(compileBindingSites(shadow, true)).toBeUndefined();
    expect(compileBindingSites(alias, true)).toBeUndefined();
  });

  /** The schema builders are only trusted when they are janux's own. */
  it('bails out when the schema builders are not imported from janux', () => {
    const code = `import { component } from 'janux';
const schema = (x: any) => x; const int = () => 0;
export const Card = component({
  name: 'card',
  state: schema({ count: int() }),
  view: ({ state }: any) => <span>{state.count}</span>,
});\n`;

    expect(compileBindingSites(code, true)).toBeUndefined();
  });

  it('returns undefined for modules without a provable site or without component()', () => {
    expect(compileBindingSites(`export const x = 1;\n`, true)).toBeUndefined();
    expect(compileBindingSites('const = broken (', true)).toBeUndefined();
  });

  /** Same gate as the island catalog: dependencies and virtual modules are not the app's islands. */
  it('compileClientModule skips virtual modules, dependencies and non-modules', () => {
    const code = island(`state: schema({ count: int() }),
  view: ({ state }: any) => <span>{state.count}</span>,`);

    expect(compileClientModule('/app/src/Card.tsx', code)).toContain('() => (state.count)');
    expect(compileClientModule('\0virtual:thing.tsx', code)).toBeUndefined();
    expect(compileClientModule('/app/node_modules/dep/Card.tsx', code)).toBeUndefined();
    expect(compileClientModule('/app/src/styles.css', code)).toBeUndefined();
    expect(compileClientModule('/app/src/Card.tsx?v=1', code)).toContain('() => (state.count)');
  });

  /** Spans are byte offsets and sources are not all ASCII — the splice happens on bytes. */
  it('splices correctly past non-ASCII source', () => {
    const code = island(`state: schema({ count: int() }),
  // càrrega — 🧭 comentari no ASCII
  view: ({ state }: any) => <span>{state.count}</span>,`);

    expect(compileBindingSites(code, true)).toContain('<span>{() => (state.count)}</span>');
  });
});
