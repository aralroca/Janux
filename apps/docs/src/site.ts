/**
 * The public origin, in one place: `janux.config.ts` hands it to the framework
 * (which resolves each route's relative `image`/`canonical` and builds the
 * sitemap with it), and the JSON-LD builders need it too — structured data
 * carries its own absolute URLs, which the framework can't infer from opaque
 * JSON.
 */
export const SITE_URL = 'https://janux.build';

/**
 * The social card, at the 1200×630 every platform crops to — drawn from the
 * logo by `scripts/og-image.ts`, not photographed. It used to be the demo
 * video's poster: a 1440×900 screenshot of a console, which cropped to an
 * unreadable slice of UI and said nothing about what Janux is.
 */
export const SOCIAL_IMAGE = '/og.png';
export const SOCIAL_IMAGE_SIZE = { width: '1200', height: '630' };
export const SOCIAL_IMAGE_ALT = 'Janux — the fullstack framework for the Agentic Web';

/** The frame the demo video opens on. The home page preloads it: it is that page's largest paint. */
export const HERO_POSTER = '/demo-poster.jpg';

/**
 * Everything a shared link needs beyond the page's own title, description and
 * image, on every page: the site it belongs to, the language it is written in,
 * and alt text for the card — a preview is an image like any other, and a
 * screen reader announcing "image" and nothing else is the same failure here as
 * in the page body.
 */
export const SOCIAL_DEFAULTS = {
  siteName: 'Janux',
  locale: 'en_US',
  imageAlt: SOCIAL_IMAGE_ALT,
  'image:width': SOCIAL_IMAGE_SIZE.width,
  'image:height': SOCIAL_IMAGE_SIZE.height,
} as const;

export function absolute(path: string): string {
  return new URL(path, SITE_URL).href;
}
