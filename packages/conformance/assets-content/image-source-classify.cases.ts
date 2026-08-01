import type { Case } from '../support/case';

/**
 * The two questions asked of every `src` before anything is emitted: can Janux
 * re-encode it, and does Janux own it?
 *
 * They decide whether a `<picture>` appears at all, and getting either wrong is
 * silent — an unoptimizable source wrapped in `<picture>` means every candidate
 * 404s, and a remote URL classified as local means a build tries to open a file
 * that was never there.
 *
 * `isRemote` deliberately matches *any* scheme, not just `http(s)`, and treats
 * a protocol-relative `//host` as remote: both are things no local file lookup
 * can satisfy. The Windows-drive row is the cost of that rule, and it is the
 * right trade — `C:/x.png` is not a path into `public/` either.
 */
export interface SourceClassifyCase {
  /** The `src` as authored. */
  path: string;
  /** Whether Janux would re-encode it into avif/webp variants. */
  optimizable: boolean;
  /** Whether it points outside the app, so there is no local file to read. */
  remote: boolean;
}

export type SourceClassifyRow = Case<SourceClassifyCase>;

export const SOURCE_CLASSIFY_CASES: SourceClassifyRow[] = [
  // Raster formats worth re-encoding.
  { id: 'asset-classify-png', src: 'janux', path: '/hero.png', optimizable: true, remote: false },
  { id: 'asset-classify-jpg', src: 'janux', path: '/hero.jpg', optimizable: true, remote: false },
  { id: 'asset-classify-jpeg', src: 'janux', path: '/hero.jpeg', optimizable: true, remote: false },
  { id: 'asset-classify-webp', src: 'janux', path: '/hero.webp', optimizable: true, remote: false },
  { id: 'asset-classify-uppercase-png', src: 'astro:core-image#supports-uppercased-imports', path: '/HERO.PNG', optimizable: true, remote: false },
  { id: 'asset-classify-mixed-case-jpeg', src: 'janux', path: '/photos/a.JPeG', optimizable: true, remote: false },
  { id: 'asset-classify-name-is-only-an-extension', src: 'janux', path: '/.png', optimizable: true, remote: false },
  { id: 'asset-classify-nested-optimizable', src: 'janux', path: '/a/b/c/d.jpg', optimizable: true, remote: false },

  // Formats left alone.
  { id: 'asset-classify-svg-is-already-optimal', src: 'astro:core-image#properly-skip-processing-SVGs', path: '/logo.svg', optimizable: false, remote: false },
  { id: 'asset-classify-gif-is-usually-animated', src: 'janux', path: '/anim.gif', optimizable: false, remote: false },
  { id: 'asset-classify-avif-is-already-a-target', src: 'janux', path: '/a.avif', optimizable: false, remote: false },
  { id: 'asset-classify-bmp', src: 'janux', path: '/a.bmp', optimizable: false, remote: false },
  { id: 'asset-classify-tiff', src: 'janux', path: '/a.tiff', optimizable: false, remote: false },
  { id: 'asset-classify-ico', src: 'janux', path: '/favicon.ico', optimizable: false, remote: false },
  { id: 'asset-classify-no-extension', src: 'janux', path: '/photo', optimizable: false, remote: false },
  { id: 'asset-classify-extension-is-not-last', src: 'janux', path: '/a.png.txt', optimizable: false, remote: false },
  { id: 'asset-classify-extension-followed-by-a-query', src: 'janux', path: '/a.jpg?v=2', optimizable: false, remote: false },
  { id: 'asset-classify-extension-followed-by-a-fragment', src: 'janux', path: '/a.jpg#top', optimizable: false, remote: false },
  { id: 'asset-classify-directory-named-like-an-image', src: 'janux', path: '/a.png/b', optimizable: false, remote: false },

  // Local shapes.
  { id: 'asset-classify-root-relative-is-local', src: 'janux', path: '/a.png', optimizable: true, remote: false },
  { id: 'asset-classify-bare-relative-is-local', src: 'janux', path: 'a.png', optimizable: true, remote: false },
  { id: 'asset-classify-dot-relative-is-local', src: 'janux', path: './a.png', optimizable: true, remote: false },
  { id: 'asset-classify-parent-relative-is-local', src: 'janux', path: '../a.png', optimizable: true, remote: false },
  { id: 'asset-classify-colon-inside-a-path-segment', src: 'janux', path: '/a:b/c.png', optimizable: true, remote: false },

  // Remote shapes: nothing a local file read can satisfy.
  { id: 'asset-classify-https-is-remote', src: 'janux', path: 'https://cdn.test/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-http-is-remote', src: 'janux', path: 'http://cdn.test/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-uppercase-scheme-is-remote', src: 'janux', path: 'HTTPS://cdn.test/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-protocol-relative-is-remote', src: 'janux', path: '//cdn.test/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-data-uri-is-remote', src: 'astro:core-image#support-data-URI', path: 'data:image/png;base64,iVBORw0KGgo=', optimizable: false, remote: true },
  { id: 'asset-classify-blob-uri-is-remote', src: 'janux', path: 'blob:https://app.test/1234', optimizable: false, remote: true },
  { id: 'asset-classify-mailto-is-remote', src: 'janux', path: 'mailto:a@b.test', optimizable: false, remote: true },
  { id: 'asset-classify-javascript-url-is-remote', src: 'janux', path: 'javascript:alert(1)', optimizable: false, remote: true },
  { id: 'asset-classify-ftp-is-remote', src: 'janux', path: 'ftp://files.test/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-scheme-with-a-plus-is-remote', src: 'janux', path: 'git+ssh://host/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-scheme-with-a-dot-is-remote', src: 'janux', path: 'x.y://host/a.png', optimizable: true, remote: true },
  { id: 'asset-classify-windows-drive-reads-as-a-scheme', src: 'janux', path: 'C:/photos/a.png', optimizable: true, remote: true },
];
