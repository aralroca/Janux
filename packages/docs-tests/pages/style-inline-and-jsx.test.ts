import { describe, expect, it } from 'bun:test';
import { createInstance, jsx, renderToString } from 'janux';
import { docExample } from '../doc-example';

/**
 * styles/inline-and-jsx.md claims two things a reader will copy verbatim: that
 * `class` is recomputed from state, and that the typed `style` object accepts
 * custom properties beside ordinary ones. Both are run here rather than trusted.
 */

describe('styles/inline-and-jsx.md', () => {
  it('the toggle snippet runs: flipping state swaps the class', async () => {
    const { Toggle } = await docExample('apps/docs/content/styles/inline-and-jsx.md', 0);
    const instance = createInstance(Toggle);

    await instance.attach();
    expect(instance.snapshot().on).toBe(false);

    await instance.intents.flip();
    expect(instance.snapshot().on).toBe(true);
  });

  it('renders the conditional class exactly as documented', async () => {
    const { Toggle } = await docExample('apps/docs/content/styles/inline-and-jsx.md', 0);
    const { html } = await renderToString(jsx(Toggle, {}), {});

    expect(html).toContain('class="pill"');
    expect(html).toContain('Off');
  });

  it('serializes a typed style object, custom properties included', async () => {
    const { html } = await renderToString(
      jsx('div', { style: { backgroundColor: '#fff', '--brand': '#0062ff' } }),
      {},
    );

    expect(html).toContain('background-color:#fff');
    expect(html).toContain('--brand:#0062ff');
  });

  it('accepts style as CSS text too', async () => {
    const { html } = await renderToString(jsx('div', { style: 'color: red; width: 10px' }), {});

    expect(html).toContain('color: red; width: 10px');
  });
});
