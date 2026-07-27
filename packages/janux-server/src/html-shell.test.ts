import { describe, expect, it } from 'bun:test';
import { htmlDocument, shellParts, type ShellOptions } from './html-shell';

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

/**
 * The streaming response is `prelude + body chunks + epilogue`. These guard the
 * invariant the whole feature rests on: reassembling the parts is byte-identical
 * to the buffered document, whatever the options — so streaming can never change
 * what the client diffs.
 */
describe('shellParts (streaming shell)', () => {
  const variants: [string, ShellOptions][] = [
    ['static page, no islands', base],
    [
      'islands with snapshots and runtime',
      {
        ...base,
        snapshots: [{ uri: 'ui://cart#default', state: { items: [] } }],
        islandNames: ['cart'],
        runtimeUrl: '/client.js',
        title: 'Shop',
        description: 'D',
        stylesheets: ['/styles.css'],
        favicon: '/favicon.svg',
        manifestUrl: '/_janux/manifest',
      },
    ],
    [
      'i18n page with payload',
      {
        ...base,
        islandNames: ['cart'],
        snapshots: [],
        i18n: { locale: 'ar', dir: 'rtl', payload: { locale: 'ar', messages: { hi: 'x' } } },
      },
    ],
    ['empty body html', { ...base, html: '' }],
  ];

  it.each(variants)('prelude + html + epilogue === htmlDocument (%s)', (_name, options) => {
    const { prelude, epilogue } = shellParts(options);
    const joined = [prelude, options.html, epilogue].filter(Boolean).join('\n');

    expect(joined).toBe(htmlDocument(options));
  });

  it('keeps every render-dependent node in the epilogue, not the prelude', () => {
    const options = variants[1]![1];
    const { prelude, epilogue } = shellParts(options);

    expect(prelude).toContain('</head>');
    expect(prelude).toContain('<body>');
    expect(prelude).not.toContain('janux+state');
    expect(prelude).not.toContain('__JANUX_ISLANDS__');
    expect(epilogue).toContain('janux+state');
    expect(epilogue).toContain('__JANUX_ISLANDS__');
    expect(epilogue).toContain('</html>');
  });
});

/**
 * Speculation rules are for the navigations the browser drives itself: they do
 * not apply to the SPA path's fetch. So the shell emits them for every internal
 * link, and the client narrows them once it starts intercepting.
 */
describe('htmlDocument navigation and speculation rules', () => {
  it('prefetches internal links on hover by default', () => {
    const html = htmlDocument(base);

    expect(html).toContain('<script type="speculationrules" key="jx-speculation" id="jx-speculation">');
    expect(html).toContain('"eagerness":"moderate"');
    expect(html).toContain('"href_matches":"/*"');
  });

  it('reflects the configured eagerness and exclusions', () => {
    const html = htmlDocument({
      ...base,
      navigation: { speculationRules: { eagerness: 'conservative', exclude: ['/logout'] } },
    });
    const rules = JSON.parse(html.match(/type="speculationrules"[^>]*>([^<]+)</)![1]!);

    expect(rules.prefetch[0].eagerness).toBe('conservative');
    expect(rules.prefetch[0].where.and).toContainEqual({ not: { href_matches: '/logout' } });
  });

  it('emits none when they are turned off', () => {
    expect(htmlDocument({ ...base, navigation: { speculationRules: false } })).not.toContain('speculationrules');
  });

  it('ships the navigation config to the client, and nothing when it is empty', () => {
    const configured = htmlDocument({ ...base, navigation: { prefetch: false } });

    expect(configured).toContain('type="application/janux+config" key="jx-config"');
    expect(configured).toContain('"prefetch":false');
    expect(htmlDocument(base)).not.toContain('janux+config');
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
