/** An arbitrary head element, for anything the fields below don't cover. */
export interface HeadTag {
  tag: string;
  attrs?: Record<string, string>;
  /** Text content, escaped. Void elements (`link`, `meta`) ignore it. */
  text?: string;
}

/**
 * What a route's `meta` export may return — everything the document head can
 * carry. `title` and `description` are the two the shell falls back to the app
 * config for; the rest are per-page or absent.
 *
 * `image` and `canonical` may be root-relative: the shell resolves them against
 * `siteUrl`, because Open Graph and canonical links require absolute URLs.
 */
export interface PageMeta {
  title?: string;
  description?: string;
  /** Social preview image. Feeds `og:image` and `twitter:image`. */
  image?: string;
  canonical?: string;
  robots?: string;
  /** `og:*` values, unprefixed keys (`{ type: 'article' }`). Overrides the derived ones. */
  og?: Record<string, string>;
  /** `twitter:*` values, unprefixed keys (`{ site: '@janux' }`). Overrides the derived ones. */
  twitter?: Record<string, string>;
  /** One `<script type="application/ld+json">` per entry. */
  jsonLd?: unknown | unknown[];
  head?: HeadTag[];
}
