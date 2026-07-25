import { describe, expect, it } from 'bun:test';
import { absoluteUrl, headTags } from './head-tags';

const ctx = { siteUrl: 'https://janux.dev', title: 'What is Janux?', description: 'A framework.' };

describe('headTags derivation', () => {
  it('derives the whole card from the page title, description and image', () => {
    const html = headTags({ image: '/og/x.png' }, ctx);

    expect(html).toContain('<meta property="og:title" id="jx-og-title" content="What is Janux?">');
    expect(html).toContain('<meta property="og:description" id="jx-og-description" content="A framework.">');
    expect(html).toContain('<meta property="og:type" id="jx-og-type" content="website">');
    expect(html).toContain('<meta property="og:image" id="jx-og-image" content="https://janux.dev/og/x.png">');
    expect(html).toContain('<meta name="twitter:card" id="jx-twitter-card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:image" id="jx-twitter-image" content="https://janux.dev/og/x.png">');
  });

  it('falls back to a plain summary card with no image', () => {
    expect(headTags({}, ctx)).toContain('content="summary"');
    expect(headTags({}, ctx)).not.toContain('og:image');
  });

  it('lets og and twitter maps override the derived values', () => {
    const html = headTags({ og: { type: 'article', title: 'Custom' }, twitter: { site: '@janux' } }, ctx);

    expect(html).toContain('content="article"');
    expect(html).toContain('<meta property="og:title" id="jx-og-title" content="Custom">');
    expect(html).toContain('<meta name="twitter:site" id="jx-twitter-site" content="@janux">');
    // exactly one og:title, not the derived one plus the override
    expect(html.match(/id="jx-og-title"/g)).toHaveLength(1);
  });

  it('accepts already-prefixed keys rather than emitting og:og:type', () => {
    expect(headTags({ og: { 'og:type': 'article' } }, ctx)).toContain('property="og:type"');
  });

  it('omits empty derived values instead of emitting empty content', () => {
    expect(headTags({}, { siteUrl: ctx.siteUrl })).not.toContain('og:title');
  });

  it("prefers the route meta's own title over the shell's resolved one", () => {
    expect(headTags({ title: 'Route title' }, ctx)).toContain('content="Route title"');
  });
});

describe('headTags canonical, robots and absolute URLs', () => {
  it('emits a keyed canonical link and feeds og:url from it', () => {
    const html = headTags({ canonical: '/docs/x' }, ctx);

    expect(html).toContain('<link rel="canonical" id="jx-canonical" href="https://janux.dev/docs/x">');
    expect(html).toContain('<meta property="og:url" id="jx-og-url" content="https://janux.dev/docs/x">');
  });

  it('leaves an already-absolute URL alone', () => {
    expect(absoluteUrl('https://cdn.example.com/a.png', ctx.siteUrl)).toBe('https://cdn.example.com/a.png');
  });

  it('drops a relative URL when there is no siteUrl, rather than emitting a broken one', () => {
    const html = headTags({ image: '/og/x.png', canonical: '/docs/x' }, { title: 'T' });

    expect(html).not.toContain('og:image');
    expect(html).not.toContain('canonical');
  });

  it('resolves against a siteUrl that carries a trailing slash or a path', () => {
    expect(absoluteUrl('/a.png', 'https://janux.dev/')).toBe('https://janux.dev/a.png');
    expect(absoluteUrl('/a.png', 'https://janux.dev/docs')).toBe('https://janux.dev/a.png');
  });

  it('emits robots only when asked', () => {
    expect(headTags({ robots: 'noindex' }, ctx)).toContain('<meta name="robots" id="jx-robots" content="noindex">');
    expect(headTags({}, ctx)).not.toContain('name="robots"');
  });
});

describe('headTags JSON-LD', () => {
  it('emits one keyed script per entry, single object or array', () => {
    expect(headTags({ jsonLd: { '@type': 'WebSite' } }, ctx)).toContain(
      '<script type="application/ld+json" id="jx-jsonld-0">{"@type":"WebSite"}</script>',
    );
    const many = headTags({ jsonLd: [{ a: 1 }, { b: 2 }] }, ctx);

    expect(many).toContain('id="jx-jsonld-0"');
    expect(many).toContain('id="jx-jsonld-1"');
  });

  /**
   * The one that matters: structured data is app-supplied, often built from
   * page content, and a `</script>` inside it would end the script element and
   * turn the rest of the payload into live markup.
   */
  it('cannot break out of the script element', () => {
    const html = headTags({ jsonLd: { name: '</script><img src=x onerror=alert(1)>' } }, ctx);

    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003c/script');
  });

  it('emits nothing for an empty array or undefined', () => {
    expect(headTags({ jsonLd: [] }, ctx)).not.toContain('ld+json');
    expect(headTags({}, ctx)).not.toContain('ld+json');
  });
});

describe('headTags escape hatch', () => {
  it('renders arbitrary tags, keyed, and keeps void elements unclosed', () => {
    const html = headTags(
      { head: [{ tag: 'link', attrs: { rel: 'preload', as: 'image', href: '/poster.jpg' } }] },
      ctx,
    );

    expect(html).toContain('<link rel="preload" as="image" href="/poster.jpg" id="jx-head-0">');
    expect(html).not.toContain('</link>');
  });

  it('honours an explicit id and closes non-void tags around escaped text', () => {
    const html = headTags({ head: [{ tag: 'style', attrs: { id: 'critical' }, text: 'a{color:red}' }] }, ctx);

    expect(html).toContain('<style id="critical">a{color:red}</style>');
  });

  /**
   * `style` and `script` are raw-text elements: entities are not decoded inside
   * them, so escaping `&` would break CSS nesting rather than protect anything.
   * The closing sequence is the only thing that has to be neutralised.
   */
  it('leaves raw-text content alone but cannot let it close the element', () => {
    const css = '.card{color:red;& .title{color:blue}}@media (width < 600px){.card{color:green}}';
    const html = headTags({ head: [{ tag: 'style', text: css }] }, ctx);

    expect(html).toContain(css);
    expect(html).not.toContain('&amp;');

    const escape = headTags({ head: [{ tag: 'style', text: 'a{content:"</style><img src=x>"}' }] }, ctx);

    expect(escape).not.toContain('</style><img');
    expect(escape).toContain('<\\/style');
  });

  it('escapes attribute names, not just their values', () => {
    const html = headTags({ head: [{ tag: 'meta', attrs: { 'name="x" onload="alert(1)': 'y' } }] }, ctx);

    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain('&quot;');
  });

  // `>` needs no escaping inside a quoted attribute once `"` and `<` are gone —
  // same contract as every other attribute the shell writes.
  it('escapes attribute values so they cannot close the attribute or open a tag', () => {
    const html = headTags({ head: [{ tag: 'meta', attrs: { content: '"><script>' } }] }, ctx);

    expect(html).not.toContain('<script>');
    expect(html).toContain('content="&quot;>&lt;script>"');
  });
});

describe('headTags with no meta', () => {
  it('contributes nothing at all', () => {
    expect(headTags(undefined, ctx)).toBe('');
  });
});
