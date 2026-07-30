import { describe, expect, it } from 'bun:test';
import { createInstance, jsx, renderToString } from 'janux';
import { docExample } from '../doc-example';

/**
 * styles/css-variables.md makes an SSR claim — that the themed page arrives
 * already themed, with no flash waiting for JavaScript. That is only true if
 * the custom property is in the server-rendered markup, which is what this
 * asserts.
 */

describe('styles/css-variables.md', () => {
  it('writes the custom property into the server-rendered markup', async () => {
    const { ThemeLab } = await docExample('apps/docs/content/styles/css-variables.md', 0);
    const { html } = await renderToString(jsx(ThemeLab, {}), {});

    expect(html).toContain('--brand:#0062ff');
    expect(html).toContain('class="cta"');
  });

  it('the theme intent runs and moves the state the property reads from', async () => {
    const { ThemeLab } = await docExample('apps/docs/content/styles/css-variables.md', 0);
    const instance = createInstance(ThemeLab);

    await instance.attach();
    expect(instance.snapshot().brand).toBe('ocean');

    await instance.intents.setBrand({ brand: 'ember' });
    expect(instance.snapshot().brand).toBe('ember');
  });
});
