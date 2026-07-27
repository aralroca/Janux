import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://janux.build/' });

const { renderMarkdown } = await import('./markdown');

afterAll(() => GlobalRegistrator.unregister());

describe('renderMarkdown', () => {
  it('renders bold, code and tables as HTML', () => {
    const html = renderMarkdown('**Bold** and `api()`\n\n| a | b |\n| - | - |\n| 1 | 2 |');

    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>api()</code>');
    expect(html).toContain('<table>');
  });

  it('closes the markdown a half-arrived answer left open', () => {
    expect(renderMarkdown('**streaming in progr')).toContain('<strong>streaming in progr</strong>');
    expect(renderMarkdown('an `intent')).toContain('<code>intent</code>');
  });

  it('does not leave an incomplete link as a placeholder URL', () => {
    const html = renderMarkdown('see [the guide](/docs/guide/int');

    expect(html).toContain('the guide');
    expect(html).not.toContain('streamdown:incomplete-link');
  });

  it('strips scripts, event handlers and javascript: urls', () => {
    const html = renderMarkdown('hi <script>alert(1)</script> <a href="javascript:x" onclick="y()">link</a>');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });

  it('strips an executable scheme hidden behind control characters', () => {
    const html = renderMarkdown('<a href="java\tscript:alert(1)">x</a> <img src="x" onerror="alert(1)">');

    expect(html).not.toContain('script:');
    expect(html).not.toContain('onerror');
  });

  it('drops the style attribute (a fixed overlay over the docs, and a no-click beacon)', () => {
    const html = renderMarkdown(
      '<div style="position:fixed;inset:0;z-index:99">give me your key</div>' +
        '<p style="background-image:url(https://evil.test/?leak)">x</p>',
    );

    expect(html).not.toContain('style=');
    expect(html).not.toContain('evil.test');
  });

  it('removes a nested template instead of leaving its children unscrubbed', () => {
    // Its children live in a DocumentFragment, which querySelectorAll never walks.
    const html = renderMarkdown('<template><img src=x onerror="alert(1)"><script>alert(2)</script></template>');

    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<template');
  });

  it('strips an executable formaction and SMIL retargeting', () => {
    const html = renderMarkdown(
      '<button formaction="javascript:alert(1)">go</button>' +
        '<svg><a><animate attributeName="href" to="javascript:alert(1)"/><text>go</text></a></svg>',
    );

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<animate');
  });

  it('keeps docs links inside the SPA and sends external ones away', () => {
    const html = renderMarkdown('[docs](/docs/guide/components#islands) and [github](https://github.com/aralroca/Janux)');

    expect(html).toContain('href="/docs/guide/components#islands"');
    expect(html).not.toMatch(/href="\/docs[^"]*"[^>]*target/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
