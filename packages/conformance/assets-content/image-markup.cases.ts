import type { Case } from '../support/case';
import type { ImageProps } from '../../janux/src/image/image';

/**
 * What `<Image>` actually serialises to — the whole string, not a substring.
 *
 * The exact markup is the contract here for two reasons. An image is the one
 * component that must ship *no* client bytes, so a rendered `<picture>` that
 * grew a marker attribute or a hydration id would be a regression no
 * `toContain` assertion would ever notice. And the box (`width`/`height` on the
 * `<img>` itself) is what reserves space before the bytes arrive; a diff that
 * silently drops it turns CLS 0 into a page that jumps.
 */
export interface ImageMarkupCase {
  props: ImageProps;
  /** The complete HTML `renderToString` produces. */
  expected: string;
}

export type ImageMarkupRow = Case<ImageMarkupCase>;

const AVIF_640 =
  '<source type="image/avif" srcSet="/_janux/image/hero.jpg/320.avif 320w, /_janux/image/hero.jpg/640.avif 640w, ' +
  '/_janux/image/hero.jpg/960.avif 960w, /_janux/image/hero.jpg/1280.avif 1280w" sizes="640px"/>';
const WEBP_640 =
  '<source type="image/webp" srcSet="/_janux/image/hero.jpg/320.webp 320w, /_janux/image/hero.jpg/640.webp 640w, ' +
  '/_janux/image/hero.jpg/960.webp 960w, /_janux/image/hero.jpg/1280.webp 1280w" sizes="640px"/>';

export const IMAGE_MARKUP_CASES: ImageMarkupRow[] = [
  {
    /** AVIF first, WebP second, the original last: the browser takes the first it understands. */
    id: 'asset-markup-picture-offers-both-modern-formats',
    src: 'janux',
    props: { src: '/hero.jpg', alt: 'A hero', width: 640, height: 360 },
    expected: `<picture>${AVIF_640}${WEBP_640}<img src="/hero.jpg" alt="A hero" width="640" height="360" loading="lazy" decoding="async"/></picture>`,
  },
  {
    id: 'asset-markup-lazy-and-async-by-default',
    src: 'astro:core-image#includes-loading-and-decoding-attributes',
    props: { src: '/a.png', alt: 'a', width: 48, height: 48 },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/a.png/320.avif 320w" sizes="48px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/a.png/320.webp 320w" sizes="48px"/>' +
      '<img src="/a.png" alt="a" width="48" height="48" loading="lazy" decoding="async"/></picture>',
  },
  {
    /** The LCP image, and nothing else on the page: eager plus a priority hint. */
    id: 'asset-markup-priority-swaps-both-hints',
    src: 'astro:core-image#includes-priority-loading-attributes',
    props: { src: '/hero.jpg', alt: 'h', width: 320, height: 180, priority: true },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/hero.jpg/320.avif 320w, /_janux/image/hero.jpg/640.avif 640w" sizes="320px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/hero.jpg/320.webp 320w, /_janux/image/hero.jpg/640.webp 640w" sizes="320px"/>' +
      '<img src="/hero.jpg" alt="h" width="320" height="180" loading="eager" decoding="async" fetchPriority="high"/></picture>',
  },
  {
    /** `alt=""` is the correct value for a decorative image, and must survive as one. */
    id: 'asset-markup-empty-alt-is-preserved',
    src: 'astro:core-image#includes-the-provided-alt',
    props: { src: '/deco.png', alt: '', width: 48, height: 48 },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/deco.png/320.avif 320w" sizes="48px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/deco.png/320.webp 320w" sizes="48px"/>' +
      '<img src="/deco.png" alt="" width="48" height="48" loading="lazy" decoding="async"/></picture>',
  },
  {
    id: 'asset-markup-aspect-ratio-string-derives-the-height',
    src: 'astro:core-image#has-proper-width-and-height---only-width',
    props: { src: '/x.png', alt: 'r', width: 1000, aspectRatio: '4/3' },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/x.png/320.avif 320w, /_janux/image/x.png/640.avif 640w, ' +
      '/_janux/image/x.png/960.avif 960w, /_janux/image/x.png/1280.avif 1280w, /_janux/image/x.png/1920.avif 1920w" sizes="1000px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/x.png/320.webp 320w, /_janux/image/x.png/640.webp 640w, ' +
      '/_janux/image/x.png/960.webp 960w, /_janux/image/x.png/1280.webp 1280w, /_janux/image/x.png/1920.webp 1920w" sizes="1000px"/>' +
      '<img src="/x.png" alt="r" width="1000" height="750" loading="lazy" decoding="async"/></picture>',
  },
  {
    id: 'asset-markup-numeric-aspect-ratio',
    src: 'janux',
    props: { src: '/n.png', alt: 'n', width: 900, aspectRatio: 1.5 },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/n.png/320.avif 320w, /_janux/image/n.png/640.avif 640w, ' +
      '/_janux/image/n.png/960.avif 960w, /_janux/image/n.png/1280.avif 1280w" sizes="900px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/n.png/320.webp 320w, /_janux/image/n.png/640.webp 640w, ' +
      '/_janux/image/n.png/960.webp 960w, /_janux/image/n.png/1280.webp 1280w" sizes="900px"/>' +
      '<img src="/n.png" alt="n" width="900" height="600" loading="lazy" decoding="async"/></picture>',
  },
  {
    /** A fractional height is rounded, never left as `33.333…` in an attribute. */
    id: 'asset-markup-derived-height-is-rounded',
    src: 'janux',
    props: { src: '/r.png', alt: 'r', width: 100, aspectRatio: 3 },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/r.png/320.avif 320w" sizes="100px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/r.png/320.webp 320w" sizes="100px"/>' +
      '<img src="/r.png" alt="r" width="100" height="33" loading="lazy" decoding="async"/></picture>',
  },
  {
    /** Fluid images state their own `sizes`; the default would pin the browser to one width. */
    id: 'asset-markup-explicit-sizes-replaces-the-default',
    src: 'janux',
    props: { src: '/hero.jpg', alt: 'f', width: 1200, height: 800, sizes: '(max-width: 60rem) 100vw, 60rem' },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/hero.jpg/320.avif 320w, /_janux/image/hero.jpg/640.avif 640w, ' +
      '/_janux/image/hero.jpg/960.avif 960w, /_janux/image/hero.jpg/1280.avif 1280w, /_janux/image/hero.jpg/1920.avif 1920w" ' +
      'sizes="(max-width: 60rem) 100vw, 60rem"/>' +
      '<source type="image/webp" srcSet="/_janux/image/hero.jpg/320.webp 320w, /_janux/image/hero.jpg/640.webp 640w, ' +
      '/_janux/image/hero.jpg/960.webp 960w, /_janux/image/hero.jpg/1280.webp 1280w, /_janux/image/hero.jpg/1920.webp 1920w" ' +
      'sizes="(max-width: 60rem) 100vw, 60rem"/>' +
      '<img src="/hero.jpg" alt="f" width="1200" height="800" loading="lazy" decoding="async"/></picture>',
  },
  {
    /** A webp source is still worth an avif candidate, and keeps a webp one. */
    id: 'asset-markup-webp-source-still-gets-variants',
    src: 'astro:core-image#supports-avif',
    props: { src: '/pic.webp', alt: 'w', width: 480, height: 240 },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/pic.webp/320.avif 320w, /_janux/image/pic.webp/640.avif 640w, ' +
      '/_janux/image/pic.webp/960.avif 960w" sizes="480px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/pic.webp/320.webp 320w, /_janux/image/pic.webp/640.webp 640w, ' +
      '/_janux/image/pic.webp/960.webp 960w" sizes="480px"/>' +
      '<img src="/pic.webp" alt="w" width="480" height="240" loading="lazy" decoding="async"/></picture>',
  },
  {
    /**
     * The `srcset` carries the encoded name while the fallback `src` carries the
     * literal one: the attribute stays parseable and the plain `<img>` still
     * points at the file on disk.
     */
    id: 'asset-markup-space-encoded-in-srcset-literal-in-src',
    src: 'astro:core-image#Supports-special-characters-in-file-name',
    props: { src: '/my photo.jpg', alt: 's', width: 320, height: 160 },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/my%20photo.jpg/320.avif 320w, /_janux/image/my%20photo.jpg/640.avif 640w" sizes="320px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/my%20photo.jpg/320.webp 320w, /_janux/image/my%20photo.jpg/640.webp 640w" sizes="320px"/>' +
      '<img src="/my photo.jpg" alt="s" width="320" height="160" loading="lazy" decoding="async"/></picture>',
  },
  {
    /** Layout is the app's business; the component only owns the box and the sources. */
    id: 'asset-markup-class-and-style-pass-through',
    src: 'janux',
    props: { src: '/hero.jpg', alt: 'c', width: 320, height: 160, class: 'rounded', style: { objectFit: 'cover' } },
    expected:
      '<picture><source type="image/avif" srcSet="/_janux/image/hero.jpg/320.avif 320w, /_janux/image/hero.jpg/640.avif 640w" sizes="320px"/>' +
      '<source type="image/webp" srcSet="/_janux/image/hero.jpg/320.webp 320w, /_janux/image/hero.jpg/640.webp 640w" sizes="320px"/>' +
      '<img src="/hero.jpg" alt="c" width="320" height="160" loading="lazy" decoding="async" class="rounded" style="object-fit:cover"/></picture>',
  },

  // Sources with nothing to optimize: a bare <img>, never a <picture> whose candidates 404.
  {
    id: 'asset-markup-svg-renders-a-bare-img',
    src: 'astro:core-image#properly-skip-processing-SVGs-but-does-not-error',
    props: { src: '/logo.svg', alt: 'logo', width: 100, height: 50 },
    expected: '<img src="/logo.svg" alt="logo" width="100" height="50" loading="lazy" decoding="async"/>',
  },
  {
    id: 'asset-markup-gif-renders-a-bare-img',
    src: 'janux',
    props: { src: '/anim.gif', alt: 'g', width: 200, height: 100 },
    expected: '<img src="/anim.gif" alt="g" width="200" height="100" loading="lazy" decoding="async"/>',
  },
  {
    id: 'asset-markup-unoptimized-opts-a-local-file-out',
    src: 'janux',
    props: { src: '/hero.jpg', alt: 'u', width: 300, height: 150, unoptimized: true },
    expected: '<img src="/hero.jpg" alt="u" width="300" height="150" loading="lazy" decoding="async"/>',
  },
  {
    id: 'asset-markup-remote-is-linked-as-is',
    src: 'astro:core-image#properly-handles-remote-images',
    props: { src: 'https://cdn.test/pic.jpg', alt: 'r', width: 300, height: 150, unoptimized: true },
    expected: '<img src="https://cdn.test/pic.jpg" alt="r" width="300" height="150" loading="lazy" decoding="async"/>',
  },
  {
    id: 'asset-markup-data-uri-is-linked-as-is',
    src: 'astro:core-image#support-data-URI',
    props: { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'd', width: 10, height: 10, unoptimized: true },
    expected: '<img src="data:image/png;base64,iVBORw0KGgo=" alt="d" width="10" height="10" loading="lazy" decoding="async"/>',
  },
  {
    /** Still boxed: an unoptimized image reserves its space like any other. */
    id: 'asset-markup-unoptimized-still-reserves-the-box',
    src: 'janux',
    props: { src: 'https://cdn.test/p.jpg', alt: 'b', width: 640, aspectRatio: '16/9', unoptimized: true },
    expected: '<img src="https://cdn.test/p.jpg" alt="b" width="640" height="360" loading="lazy" decoding="async"/>',
  },
  {
    /**
     * `unoptimized` links a source as-is, but "as-is" stops at the renderer's
     * URL guard: an executable scheme is dropped from the attribute rather than
     * written into the document.
     */
    id: 'asset-markup-executable-url-is-dropped-by-the-renderer',
    src: 'janux',
    props: { src: 'javascript:alert(1)', alt: 'x', width: 10, height: 10, unoptimized: true },
    expected: '<img alt="x" width="10" height="10" loading="lazy" decoding="async"/>',
  },
  {
    id: 'asset-markup-priority-on-an-unoptimized-source',
    src: 'janux',
    props: { src: '/logo.svg', alt: 'p', width: 64, height: 64, priority: true },
    expected: '<img src="/logo.svg" alt="p" width="64" height="64" loading="eager" decoding="async" fetchPriority="high"/>',
  },
  {
    /** An alt with markup in it is escaped like any other attribute value. */
    id: 'asset-markup-alt-is-escaped',
    src: 'janux',
    props: { src: '/logo.svg', alt: 'A "<b>bold</b>" & bigger', width: 20, height: 20 },
    expected: '<img src="/logo.svg" alt="A &quot;&lt;b&gt;bold&lt;/b&gt;&quot; &amp; bigger" width="20" height="20" loading="lazy" decoding="async"/>',
  },
];
