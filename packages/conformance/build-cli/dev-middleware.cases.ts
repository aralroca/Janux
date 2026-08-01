import { devStylesheets, fallsThroughToVite } from '../../janux-vite/src/plugin';
import { mimeFor } from '../../janux-vite/src/static-files';
import type { Case } from '../support/case';

/**
 * Where `janux dev` hands a request back to Vite, and what it serves before it.
 *
 * The dev middleware sits in front of Vite, so every decision it makes is a
 * decision about somebody else's response. Handing Vite a 404 that the app
 * meant (a proxied upstream's, a rendered `_404` page, an api handler's) turns
 * it into Vite's own "page not found" — the app's answer replaced by the
 * toolchain's, in dev only, which is the hardest kind of difference to notice.
 */

export interface FallThroughCase {
  status: number;
  contentType?: string;
  path: string;
  /** `true` when Vite gets to answer instead. */
  fallsThrough: boolean;
}

export type FallThroughRow = Case<FallThroughCase>;

export const FALL_THROUGH_CASES: FallThroughRow[] = [
  { id: 'build2-dev-a-bare-page-router-miss-goes-to-vite', src: 'janux', status: 404, path: '/nope', fallsThrough: true },
  { id: 'build2-dev-a-rendered-404-page-is-the-apps-own-answer', src: 'janux', status: 404, contentType: 'text/html;charset=utf-8', path: '/nope', fallsThrough: false },
  { id: 'build2-dev-a-framework-endpoint-owns-its-404', src: 'janux', status: 404, path: '/_janux/manifest', fallsThrough: false },
  { id: 'build2-dev-an-api-handler-owns-its-404', src: 'janux', status: 404, path: '/api/orders/9', fallsThrough: false },
  { id: 'build2-dev-a-json-404-from-a-handler-is-sent-as-it-is', src: 'janux', status: 404, contentType: 'application/json', path: '/api/orders/9', fallsThrough: false },
  { id: 'build2-dev-a-path-that-merely-starts-with-api-is-not-a-handler', src: 'janux', status: 404, path: '/apiary', fallsThrough: true },
  { id: 'build2-dev-a-served-page-never-falls-through', src: 'janux', status: 200, path: '/nope', fallsThrough: false },
  { id: 'build2-dev-a-server-error-is-not-vites-to-answer', src: 'janux', status: 500, path: '/nope', fallsThrough: false },
  { id: 'build2-dev-a-redirect-is-not-vites-to-answer', src: 'janux', status: 302, path: '/nope', fallsThrough: false },
];

export interface DevStylesheetCase {
  root: string;
  stylesheet?: string;
  urls: string[];
}

export type DevStylesheetRow = Case<DevStylesheetCase>;

export const DEV_STYLESHEET_CASES: DevStylesheetRow[] = [
  { id: 'build2-dev-asks-vite-for-the-compiled-stylesheet-itself', src: 'janux', root: '/app', stylesheet: '/app/src/styles.css', urls: ['/src/styles.css?direct'] },
  { id: 'build2-dev-keeps-a-query-the-stylesheet-already-carried', src: 'janux', root: '/app', stylesheet: '/app/src/styles.css?inline=false', urls: ['/src/styles.css?inline=false&direct'] },
  { id: 'build2-dev-links-a-preprocessed-entry-at-its-own-extension', src: 'janux', root: '/app', stylesheet: '/app/src/styles.scss', urls: ['/src/styles.scss?direct'] },
  { id: 'build2-dev-links-no-stylesheet-for-an-app-that-has-none', src: 'janux', root: '/app', urls: [] },
];

export interface PublicMimeCase {
  file: string;
  type: string;
}

export type PublicMimeRow = Case<PublicMimeCase>;

/**
 * `public/` in dev has to answer with what the built server answers with: a
 * type the browser refuses is a file that works in production and not while you
 * are writing the page — or, worse, the other way round.
 */
export const PUBLIC_MIME_CASES: PublicMimeRow[] = [
  { id: 'build2-dev-serves-an-svg-as-an-image', src: 'janux', file: '/app/public/logo.svg', type: 'image/svg+xml' },
  { id: 'build2-dev-serves-a-webmanifest-as-a-manifest', src: 'janux', file: '/app/public/app.webmanifest', type: 'application/manifest+json' },
  { id: 'build2-dev-serves-a-video-the-browser-will-play', src: 'janux', file: '/app/public/hero.mp4', type: 'video/mp4' },
  { id: 'build2-dev-serves-audio-as-audio', src: 'janux', file: '/app/public/theme.mp3', type: 'audio/mpeg' },
  { id: 'build2-dev-serves-a-woff-font-as-a-font', src: 'janux', file: '/app/public/inter.woff', type: 'font/woff' },
  { id: 'build2-dev-serves-a-wasm-module-as-wasm', src: 'janux', file: '/app/public/lib.wasm', type: 'application/wasm' },
  { id: 'build2-dev-serves-an-avif-image-as-an-image', src: 'janux', file: '/app/public/hero.avif', type: 'image/avif' },
  { id: 'build2-dev-has-nothing-to-claim-about-an-unknown-extension', src: 'janux', file: '/app/public/notes.bin', type: 'application/octet-stream' },
  { id: 'build2-dev-has-nothing-to-claim-about-a-file-with-no-extension', src: 'janux', file: '/app/public/LICENSE', type: 'application/octet-stream' },
];

/** Re-exported so the runner does not import the plugin twice. */
export { devStylesheets, fallsThroughToVite, mimeFor };
