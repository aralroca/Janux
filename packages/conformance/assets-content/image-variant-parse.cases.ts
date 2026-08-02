import type { Case } from '../support/case';
import type { ImageVariant } from '../../janux/src/image/urls';

/**
 * The parser is the trust boundary, not a convenience.
 *
 * Under `janux dev` this function is what turns a URL a stranger typed into a
 * file read and an encode, so the question every row asks is the same one:
 * *would Janux itself ever have emitted this?* Anything else is refused, and
 * refusing is cheap — the alternative is an image endpoint that reads whatever
 * path it is handed.
 *
 * The percent-encoded rows are the ones that matter. `variantUrl` encodes each
 * segment, so a traversal cannot arrive as a literal `..` — it arrives as
 * `%2e%2e`, or as `..%2f`, and a guard that inspects the *encoded* string sees
 * neither. The consumer decodes before it opens a file; so must the guard.
 */
export interface VariantParseCase {
  /** The request pathname, exactly as it would arrive. */
  pathname: string;
  /** The parsed variant, or `undefined` when the request must be refused. */
  expected: ImageVariant | undefined;
}

export type VariantParseRow = Case<VariantParseCase>;

export const VARIANT_PARSE_CASES: VariantParseRow[] = [
  // Accepted: shapes the ladder really emits.
  { id: 'asset-parse-round-trips-a-png', src: 'janux', pathname: '/_janux/image/hero.png/320.avif', expected: { src: '/hero.png', width: 320, format: 'avif' } },
  { id: 'asset-parse-round-trips-a-webp-target', src: 'janux', pathname: '/_janux/image/hero.png/640.webp', expected: { src: '/hero.png', width: 640, format: 'webp' } },
  { id: 'asset-parse-round-trips-the-largest-width', src: 'janux', pathname: '/_janux/image/hero.jpg/1920.avif', expected: { src: '/hero.jpg', width: 1920, format: 'avif' } },
  { id: 'asset-parse-round-trips-a-nested-path', src: 'janux', pathname: '/_janux/image/a/b/c.jpeg/960.webp', expected: { src: '/a/b/c.jpeg', width: 960, format: 'webp' } },
  { id: 'asset-parse-round-trips-a-webp-source', src: 'janux', pathname: '/_janux/image/pic.webp/1280.avif', expected: { src: '/pic.webp', width: 1280, format: 'avif' } },
  {
    id: 'asset-parse-accepts-an-uppercase-source-extension',
    src: 'astro:core-image#supports-uppercased-imports',
    pathname: '/_janux/image/HERO.PNG/320.avif',
    expected: { src: '/HERO.PNG', width: 320, format: 'avif' },
  },
  {
    /** The source is handed on still encoded — decoding it is the file lookup's job. */
    id: 'asset-parse-keeps-the-source-percent-encoded',
    src: 'janux',
    pathname: '/_janux/image/my%20photo.jpg/640.avif',
    expected: { src: '/my%20photo.jpg', width: 640, format: 'avif' },
  },
  {
    /** Greedy up to the last slash: a directory may legitimately be named like a variant. */
    id: 'asset-parse-splits-on-the-last-segment-only',
    src: 'janux',
    pathname: '/_janux/image/a/320.webp/640.avif',
    expected: { src: '/a/320.webp', width: 640, format: 'avif' },
  },
  {
    /** `Number` normalises it and the width is still on the ladder, so it is the same encode. */
    id: 'asset-parse-tolerates-a-zero-padded-width',
    src: 'janux',
    pathname: '/_janux/image/hero.png/0320.avif',
    expected: { src: '/hero.png', width: 320, format: 'avif' },
  },
  { id: 'asset-parse-accepts-a-dot-prefixed-name', src: 'janux', pathname: '/_janux/image/.hidden.png/320.avif', expected: { src: '/.hidden.png', width: 320, format: 'avif' } },
  { id: 'asset-parse-accepts-a-name-starting-with-two-dots', src: 'janux', pathname: '/_janux/image/..leading.png/320.avif', expected: { src: '/..leading.png', width: 320, format: 'avif' } },

  // Refused: outside the route.
  { id: 'asset-parse-refuses-another-framework-route', src: 'janux', pathname: '/_janux/manifest', expected: undefined },
  { id: 'asset-parse-refuses-the-bare-route', src: 'janux', pathname: '/_janux/image', expected: undefined },
  { id: 'asset-parse-refuses-a-route-prefix-lookalike', src: 'janux', pathname: '/_janux/images/hero.png/320.avif', expected: undefined },
  { id: 'asset-parse-refuses-an-app-path', src: 'janux', pathname: '/images/hero.png/320.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-relative-pathname', src: 'janux', pathname: '_janux/image/hero.png/320.avif', expected: undefined },

  // Refused: not a variant shape.
  { id: 'asset-parse-refuses-a-missing-source', src: 'janux', pathname: '/_janux/image/640.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-missing-format', src: 'janux', pathname: '/_janux/image/hero.png/640', expected: undefined },
  { id: 'asset-parse-refuses-an-empty-source-segment', src: 'janux', pathname: '/_janux/image//hero.png/320.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-trailing-slash', src: 'janux', pathname: '/_janux/image/hero.png/320.avif/', expected: undefined },

  // Refused: a width or format the ladder never emits.
  { id: 'asset-parse-refuses-an-off-ladder-width', src: 'janux', pathname: '/_janux/image/hero.png/999.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-width-just-off-the-ladder', src: 'janux', pathname: '/_janux/image/hero.png/321.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-fractional-width', src: 'janux', pathname: '/_janux/image/hero.png/320.5.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-negative-width', src: 'janux', pathname: '/_janux/image/hero.png/-320.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-hex-width', src: 'janux', pathname: '/_janux/image/hero.png/0x140.avif', expected: undefined },
  { id: 'asset-parse-refuses-an-unemitted-format', src: 'janux', pathname: '/_janux/image/hero.png/640.gif', expected: undefined },
  { id: 'asset-parse-refuses-the-original-format', src: 'janux', pathname: '/_janux/image/hero.png/640.png', expected: undefined },
  { id: 'asset-parse-refuses-an-uppercase-format', src: 'janux', pathname: '/_janux/image/hero.png/320.AVIF', expected: undefined },

  // Refused: a source Janux would never have linked.
  { id: 'asset-parse-refuses-an-svg-source', src: 'janux', pathname: '/_janux/image/logo.svg/640.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-gif-source', src: 'janux', pathname: '/_janux/image/anim.gif/640.avif', expected: undefined },
  { id: 'asset-parse-refuses-an-extensionless-source', src: 'janux', pathname: '/_janux/image/hero/640.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-non-image-source', src: 'janux', pathname: '/_janux/image/secrets.env/640.avif', expected: undefined },
  {
    /**
     * Not a refusal: after the route prefix every source is rooted, so a name
     * that merely *looks* like a URL is still a path under `public/`. It
     * resolves inside the public directory and 404s there — which is the file
     * lookup's answer to give, not the parser's.
     */
    id: 'asset-parse-treats-a-url-shaped-name-as-a-path',
    src: 'janux',
    pathname: '/_janux/image/https://evil.test/x.png/640.avif',
    expected: { src: '/https://evil.test/x.png', width: 640, format: 'avif' },
  },

  // Refused: traversal, however it is spelled.
  { id: 'asset-parse-refuses-a-literal-traversal', src: 'janux', pathname: '/_janux/image/../../etc/passwd.png/640.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-traversal-mid-path', src: 'janux', pathname: '/_janux/image/photos/../../../etc/passwd.png/640.avif', expected: undefined },
  {
    /** `..` cannot arrive literally — `variantUrl` would have encoded it — so this is the real shape of the attack. */
    id: 'asset-parse-refuses-a-percent-encoded-traversal',
    src: 'janux',
    pathname: '/_janux/image/%2e%2e/%2e%2e/etc/passwd.png/640.avif',
    expected: undefined,
  },
  { id: 'asset-parse-refuses-an-uppercase-encoded-traversal', src: 'janux', pathname: '/_janux/image/%2E%2E/etc/passwd.png/640.avif', expected: undefined },
  {
    /** The separator is encoded instead of the dots, so no segment reads as `..` before decoding. */
    id: 'asset-parse-refuses-a-traversal-with-an-encoded-slash',
    src: 'janux',
    pathname: '/_janux/image/..%2f..%2fetc/passwd.png/640.avif',
    expected: undefined,
  },
  { id: 'asset-parse-refuses-a-traversal-with-an-encoded-backslash', src: 'janux', pathname: '/_janux/image/..%5c..%5cetc/passwd.png/640.avif', expected: undefined },
  { id: 'asset-parse-refuses-a-half-encoded-traversal', src: 'janux', pathname: '/_janux/image/%2e./etc/passwd.png/640.avif', expected: undefined },
  {
    /** Janux only ever emits valid encoding, so a broken escape is by definition not ours. */
    id: 'asset-parse-refuses-malformed-percent-encoding',
    src: 'janux',
    pathname: '/_janux/image/a%zz.png/320.avif',
    expected: undefined,
  },
  { id: 'asset-parse-refuses-a-truncated-escape', src: 'janux', pathname: '/_janux/image/a%2.png/320.avif', expected: undefined },
];
