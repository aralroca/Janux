/**
 * The public origin, in one place: `janux.config.ts` hands it to the framework
 * (which resolves each route's relative `image`/`canonical` and builds the
 * sitemap with it), and the JSON-LD builders need it too — structured data
 * carries its own absolute URLs, which the framework can't infer from opaque
 * JSON.
 */
export const SITE_URL = 'https://janux.build';

/** Default social card: the frame the demo video opens on (1440×900). */
export const SOCIAL_IMAGE = '/demo-poster.jpg';

export function absolute(path: string): string {
  return new URL(path, SITE_URL).href;
}
