import { describe, expect, it } from 'bun:test';
import { htmlDocument, type ShellOptions } from './html-shell';

const base: ShellOptions = {
  html: '<main>hi</main>',
  snapshots: [],
  islandNames: [],
};

// These guard the SPA-navigation FOUC fix: head resource links must be keyed
// (matched by identity across the diff) and the conditional description meta
// must sit AFTER the stylesheets, so omitting it never shifts the stylesheet's
// position — otherwise the diff re-resolves it and the page flashes unstyled.
describe('htmlDocument head keying (SPA-navigation FOUC guard)', () => {
  it('gives stylesheet, favicon and manifest links a stable id', () => {
    const html = htmlDocument({
      ...base,
      stylesheets: ['/styles.css'],
      favicon: '/favicon.svg',
      manifestUrl: '/_janux/manifest',
    });

    expect(html).toContain('<link rel="stylesheet" id="jx-style-0" href="/styles.css">');
    expect(html).toContain('<link rel="icon" id="jx-favicon" href="/favicon.svg">');
    expect(html).toContain('id="jx-manifest"');
  });

  it('places the conditional description meta after the stylesheet links', () => {
    const html = htmlDocument({ ...base, stylesheets: ['/styles.css'], description: 'D' });

    expect(html.indexOf('id="jx-style-0"')).toBeLessThan(html.indexOf('name="description"'));
  });
});

/**
 * A linked stylesheet is a render-blocking round trip before the first paint.
 * Inlining trades a cacheable request for one less round trip, which is the
 * right trade for a small app sheet — and the `<style>` keeps the same keyed id,
 * so SPA navigation matches it by identity like the link it replaces.
 */
describe('htmlDocument inline styles', () => {
  it('inlines the CSS instead of linking it', () => {
    const html = htmlDocument({ ...base, inlineStyles: ['body{color:red}'] });

    expect(html).toContain('<style id="jx-style-0">body{color:red}</style>');
    expect(html).not.toContain('rel="stylesheet"');
  });

  it('keeps the link when there is nothing to inline', () => {
    const html = htmlDocument({ ...base, stylesheets: ['/styles.css'] });

    expect(html).toContain('<link rel="stylesheet" id="jx-style-0" href="/styles.css">');
    expect(html).not.toContain('<style');
  });

  it('keeps inlined CSS before the conditional description, like the link', () => {
    const html = htmlDocument({ ...base, inlineStyles: ['body{}'], description: 'D' });

    expect(html.indexOf('id="jx-style-0"')).toBeLessThan(html.indexOf('name="description"'));
  });
});

// A document with no declared language fails assistive tech (and every audit
// that checks for it). i18n apps already declare one per locale; everyone else
// used to ship a bare <html>, so the shell defaults instead of omitting.
describe('htmlDocument document language', () => {
  it('defaults to en when the app declares neither lang nor i18n', () => {
    expect(htmlDocument(base)).toContain('<html lang="en">');
  });

  it('honours the configured lang', () => {
    expect(htmlDocument({ ...base, lang: 'es' })).toContain('<html lang="es">');
  });

  it('lets i18n win over the configured lang, with a direction', () => {
    const html = htmlDocument({ ...base, lang: 'es', i18n: { locale: 'ar', dir: 'rtl' } });

    expect(html).toContain('<html lang="ar" dir="rtl">');
  });
});
