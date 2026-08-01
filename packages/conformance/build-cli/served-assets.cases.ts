// `janux start` serves the built client through these two; neither is on the
// package's export surface, so the corpus reaches for them directly.
import { cacheControl, contentType } from '../../janux-cli/src/static-assets';
import type { Case } from '../support/case';

/**
 * What a built file is served as, and for how long.
 *
 * Both answers are derived from the file *name* and nothing else, which is what
 * makes them cheap enough to run per request — and what makes their edges worth
 * pinning down. A name mistaken for a hashed one is cached for a year at the
 * URL that will serve different bytes tomorrow; an extension read wrong is a
 * `<video>` the browser refuses to play.
 */

export interface CacheCase {
  path: string;
  /** `true` when the file may be cached forever. */
  immutable: boolean;
}

export type CacheRow = Case<CacheCase>;

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'public, max-age=0, must-revalidate';

export const CACHE_HEADERS = { immutable: IMMUTABLE, revalidate: REVALIDATE };

export const CACHE_CASES: CacheRow[] = [
  { id: 'build2-cache-a-vite-content-hash-is-forever', src: 'janux', path: '/assets/index-a1b2c3d4.js', immutable: true },
  { id: 'build2-cache-a-seven-character-suffix-is-not-a-hash', src: 'janux', path: '/assets/index-a1b2c3d.js', immutable: false },
  { id: 'build2-cache-a-hash-may-be-longer-than-eight-characters', src: 'janux', path: '/assets/index-a1b2c3d4e5f6.js', immutable: true },
  { id: 'build2-cache-an-uppercase-hash-still-counts', src: 'janux', path: '/assets/index-A1B2C3D4.js', immutable: true },
  { id: 'build2-cache-a-hash-may-carry-dashes-and-underscores', src: 'janux', path: '/assets/index-a1b2_c3-d4.js', immutable: true },
  { id: 'build2-cache-an-uppercase-extension-is-not-a-built-asset', src: 'janux', path: '/assets/index-a1b2c3d4.JS', immutable: false },
  { id: 'build2-cache-the-unhashed-runtime-entry-revalidates', src: 'janux', path: '/client.js', immutable: false },
  { id: 'build2-cache-a-hashed-font-is-forever-too', src: 'janux', path: '/assets/inter-abcdefgh.woff2', immutable: true },
  { id: 'build2-cache-a-dotted-basename-can-still-be-hashed', src: 'janux', path: '/a.b-abcdefgh.css', immutable: true },
  { id: 'build2-cache-the-name-is-read-without-a-query-string', src: 'janux', path: '/index-a1b2c3d4.js?v=1', immutable: false },
  { id: 'build2-cache-a-prerendered-page-revalidates', src: 'janux', path: '/about/index.html', immutable: false },
];

export interface TypeCase {
  path: string;
  type: string;
}

export type TypeRow = Case<TypeCase>;

export const TYPE_CASES: TypeRow[] = [
  { id: 'build2-type-reads-the-extension-case-insensitively', src: 'janux', path: '/media/clip.MP4', type: 'video/mp4' },
  { id: 'build2-type-only-the-last-extension-counts', src: 'janux', path: '/archive.tar.gz', type: 'application/octet-stream' },
  { id: 'build2-type-a-trailing-dot-is-not-an-extension', src: 'janux', path: '/weird.', type: 'application/octet-stream' },
  { id: 'build2-type-a-name-with-no-slash-is-still-a-name', src: 'janux', path: 'styles.css', type: 'text/css;charset=utf-8' },
  { id: 'build2-type-a-sourcemap-is-json', src: 'janux', path: '/assets/client.js.map', type: 'application/json;charset=utf-8' },
  { id: 'build2-type-a-page-projection-is-markdown', src: 'janux', path: '/posts/hello.md', type: 'text/markdown' },
  { id: 'build2-type-a-web-app-manifest-has-its-own-type', src: 'janux', path: '/app.webmanifest', type: 'application/manifest+json' },
  { id: 'build2-type-wasm-is-served-as-wasm-so-it-can-be-streamed-compiled', src: 'janux', path: '/pkg/lib.wasm', type: 'application/wasm' },
  { id: 'build2-type-an-avif-variant-keeps-its-image-type', src: 'janux', path: '/_janux/image/hero-640.avif', type: 'image/avif' },
];

/** Re-exported so the runner does not import the CLI twice. */
export { cacheControl, contentType };
