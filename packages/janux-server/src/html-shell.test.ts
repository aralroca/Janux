import { describe, expect, it } from 'bun:test';
import {
  htmlDocument,
  queryPayloadScript,
  shellEpilogue,
  shellInterlude,
  shellParts,
  shellPrelude,
  type ShellOptions,
} from './html-shell';

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

  it('advertises the RSS feed with a keyed alternate link, only when the app has one', () => {
    const html = htmlDocument({ ...base, feed: { title: 'Janux Blog' } });

    expect(html).toContain(
      '<link rel="alternate" id="jx-feed" type="application/rss+xml" title="Janux Blog" href="/rss.xml">',
    );
    expect(htmlDocument(base)).not.toContain('application/rss+xml');
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

/**
 * Strict CSP: the whole point is that `script-src` names a nonce and nothing
 * else, so ONE unnonced tag the shell emits is a blank page. These sweep the
 * document rather than listing the tags we remember writing — a new inline
 * script added later fails here instead of in a customer's browser.
 */
describe('htmlDocument CSP nonce', () => {
  const NONCE = 'r4nd0m';
  /** Every `<script>`/`<style>` open tag, whatever its type or position. */
  const tags = (html: string): string[] => [...html.matchAll(/<(?:script|style)\b[^>]*>/g)].map(([tag]) => tag);

  // Load-bearing: the sweep is only as wide as this fixture, so a shell option
  // that emits a new tag has to be added here or it passes untested.
  const everything: ShellOptions = {
    ...base,
    snapshots: [{ uri: 'ui://cart#default', state: { items: [] } }],
    islandNames: ['cart'],
    islandModules: { cart: '/cart.js' },
    runtimeUrl: '/client.js',
    inlineStyles: ['body{color:red}'],
    fontFaces: "@font-face{font-family:'Inter'}",
    fontPreloads: ['/_janux/font/inter.woff2'],
    navigation: { prefetch: false },
    i18n: { locale: 'es', dir: 'ltr', payload: { locale: 'es', messages: { hi: 'x' } } },
    // A route's own head tags count too: the app cannot write a per-request
    // nonce itself, so an unnonced one would simply never run.
    meta: { jsonLd: [{ '@type': 'WebSite' }], head: [{ tag: 'script', text: 'a=1' }, { tag: 'style', text: 'b{}' }] },
  };

  it('nonces every script and style the document emits, with no exception', () => {
    const emitted = tags(htmlDocument({ ...everything, nonce: NONCE }));

    expect(emitted.length).toBeGreaterThan(5);
    expect(emitted.filter((tag) => !tag.includes(`nonce="${NONCE}"`))).toEqual([]);
  });

  it('nonces the streaming shell too — prelude, interlude and epilogue', () => {
    const options = { ...everything, nonce: NONCE };
    const parts = [shellPrelude(options), shellInterlude(options), shellEpilogue(options)];

    expect(parts.flatMap(tags).filter((tag) => !tag.includes(`nonce="${NONCE}"`))).toEqual([]);
  });

  it('escapes the nonce so it can never break out of the attribute', () => {
    expect(htmlDocument({ ...everything, nonce: '"><script>alert(1)</script>' })).not.toContain('<script>alert(1)');
  });

  // The zero-regression contract: an app that never configures CSP gets the
  // byte-identical document it got before the option existed.
  it('emits no nonce attribute at all when none is configured', () => {
    expect(htmlDocument(everything)).not.toContain('nonce');
  });
});

/**
 * The query hydration payload is built by the server, not spliced by the shell,
 * so it is nonced where it is built — and it is executable, which makes it the
 * one shell script a strict policy would actually refuse.
 */
describe('queryPayloadScript CSP nonce', () => {
  const client = { dehydrate: () => ({ q1: { data: 1 } }), inFlightHashes: () => [] } as never;

  it('carries the nonce it is given', () => {
    expect(queryPayloadScript(client, new Set(), 'r4nd0m')).toContain('nonce="r4nd0m"');
  });

  it('carries none when the app does not use CSP', () => {
    expect(queryPayloadScript(client, new Set())).not.toContain('nonce');
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

/**
 * A webfont shifts the layout twice unless the browser is told about it before
 * anything else: the preload starts the fetch at the top of the head, and the
 * inlined `@font-face` (with its adjusted fallback) is what stops the swap from
 * moving text. Both must precede the stylesheet — a font discovered after the
 * CSS has already painted is a font that arrives too late to matter.
 */
describe('font head', () => {
  const fonts: ShellOptions = {
    ...base,
    stylesheets: ['/styles.css'],
    fontPreloads: ['/_janux/font/inter-400-normal-latin.woff2'],
    fontFaces: "@font-face{font-family:'Inter'}",
  };

  it('preloads the critical woff2 as a font, crossorigin, before the stylesheet', () => {
    const html = htmlDocument(fonts);
    const preload = html.indexOf('rel="preload"');

    expect(html).toContain(
      '<link rel="preload" id="jx-font-0" href="/_janux/font/inter-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin>',
    );
    expect(preload).toBeLessThan(html.indexOf('id="jx-style-0"'));
  });

  it('inlines the @font-face rules before the stylesheet, so nothing paints unadjusted', () => {
    const html = htmlDocument(fonts);

    expect(html).toContain('<style id="jx-fonts">@font-face{font-family:\'Inter\'}</style>');
    expect(html.indexOf('id="jx-fonts"')).toBeLessThan(html.indexOf('id="jx-style-0"'));
  });

  it('cannot be broken out of by a family name that closes the element', () => {
    const html = htmlDocument({ ...fonts, fontFaces: "@font-face{font-family:'</style><script>x'}" });

    expect(html).not.toContain('</style><script>');
  });

  it('leaves the head alone for an app with no fonts', () => {
    expect(htmlDocument(base)).not.toContain('jx-font');
    expect(htmlDocument(base)).not.toContain('jx-fonts');
  });
});
