import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, renderToString, schema, str } from 'janux';

/**
 * guide/views-and-jsx.md documents exactly what each prop becomes in HTML.
 * Every row of those tables is asserted here against the real renderer.
 */

async function html(node: unknown): Promise<string> {
  return (await renderToString(node, {})).html;
}

describe('guide/views-and-jsx.md — the attribute table', () => {
  it('class and className both emit class', async () => {
    expect(await html(jsx('p', { class: 'a' }))).toContain('class="a"');
    expect(await html(jsx('p', { className: 'b' }))).toContain('class="b"');
  });

  it('true emits a bare attribute; false/null/undefined emit nothing', async () => {
    expect(await html(jsx('input', { disabled: true }))).toContain('disabled');
    for (const value of [false, null, undefined]) {
      expect(await html(jsx('input', { disabled: value }))).not.toContain('disabled');
    }
  });

  it('escapes values and drops plain function props', async () => {
    const escaped = await html(jsx('p', { title: '<script>&"' }));

    expect(escaped).toContain('title="&lt;script&gt;&amp;&quot;"');
    expect(await html(jsx('button', { onClick: () => {} }))).not.toContain('onClick');
  });

  it('drops invalid attribute names instead of emitting invalid HTML', async () => {
    expect(await html(jsx('p', { 'not valid': 'x' }))).not.toContain('not valid');
  });

  it('renders void elements without a closing tag', async () => {
    expect(await html(jsx('br', {}))).toBe('<br/>');
  });

  it('dangerHTML replaces children unescaped', async () => {
    const out = await html(jsx('div', { dangerHTML: '<b>raw</b>', children: 'ignored' }));

    expect(out).toBe('<div><b>raw</b></div>');
  });

  it('renders nothing for null, undefined and booleans; renders numbers and strings', async () => {
    expect(await html(jsx('p', { children: [null, undefined, false, true, 0, 'x'] }))).toBe('<p>0x</p>');
  });
});

describe('guide/views-and-jsx.md — intents become delegation markers', () => {
  const Widget = component({
    name: 'widget',
    state: schema({ query: str() }),
    intents: {
      inc: intent({ description: 'Increment', run: () => {} }),
      save: intent({ description: 'Save', run: () => {} }),
      filter: intent({ description: 'Filter', run: () => {} }),
    },
    view: ({ state, intents }: any) =>
      jsx('div', {
        children: [
          jsx('button', { on: intents.inc, children: '+1' }),
          jsx('form', { intent: intents.save }),
          jsx('input', { onInput: intents.filter, value: state.query }),
        ],
      }),
  });

  it('emits data-jxa for on, data-jxform for intent and data-jxe-input for onInput', async () => {
    const out = await html(jsx(Widget as any, {}));

    // The marker carries the island id, so a keyed sibling's events stay its own.
    expect(out).toContain('data-jxa="widget#default:inc"');
    expect(out).toContain('data-jxform="widget#default:save"');
    expect(out).toContain('data-jxe-input="widget#default:filter"');
  });
});

describe('guide/keys-and-lists.md — island identity', () => {
  const Counter = component({
    name: 'counter',
    state: schema({ label: str() }),
    intents: { noop: intent({ description: 'No-op', run: () => {} }) },
    view: ({ state }: any) => jsx('span', { children: state.label }),
  });

  it('keys the island id, sanitizes unsafe characters and dedupes collisions', async () => {
    const out = await html([
      jsx(Counter as any, { key: 'left' }),
      jsx(Counter as any, { key: 'a b/c' }),
      jsx(Counter as any, { key: 'left' }),
    ]);

    expect(out).toContain('data-jx="counter#left"');
    expect(out).toContain('data-jx="counter#a_b_c"');
    expect(out).toContain('data-jx="counter#left~2"');
  });

  it('an unkeyed island is #default, and eager/persist emit their markers', async () => {
    const out = await html(jsx(Counter as any, { eager: true, persist: true }));

    expect(out).toContain('data-jx="counter#default"');
    expect(out).toContain('data-jx-eager');
    expect(out).toContain('data-jx-persist');
  });
});
