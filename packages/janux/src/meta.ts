/** An arbitrary head element, for anything the fields below don't cover. */
export interface HeadTag {
  tag: string;
  attrs?: Record<string, string>;
  /** Text content, escaped. Void elements (`link`, `meta`) ignore it. */
  text?: string;
}

/**
 * Typed `<meta name="robots">` directives, serialized in this declaration
 * order. A plain string is still accepted for directives the type does not
 * carry (`unavailable_after`, say).
 */
export interface RobotsMeta {
  /** `true` → `index`, `false` → `noindex`; absent emits neither. */
  index?: boolean;
  /** `true` → `follow`, `false` → `nofollow`; absent emits neither. */
  follow?: boolean;
  noarchive?: boolean;
  nosnippet?: boolean;
  /** → `max-snippet:<n>`. */
  maxSnippet?: number;
  /** → `max-image-preview:<value>`. */
  maxImagePreview?: 'none' | 'standard' | 'large';
}

/**
 * `og:*` values with typed keys. CamelCase spellings exist for the properties
 * a literal key cannot name (`siteName` → `og:site_name`, `imageAlt` →
 * `og:image:alt`, `publishedTime`/`modifiedTime` → `article:*`); any other
 * property still works by its unprefixed (`site_name`) or full (`og:locale`,
 * `video:duration`) name.
 */
export interface OpenGraphMeta {
  type?: 'website' | 'article' | 'profile' | 'book' | (string & {});
  title?: string;
  description?: string;
  url?: string;
  /** → `og:site_name`. */
  siteName?: string;
  locale?: string;
  image?: string;
  /** → `og:image:alt`. */
  imageAlt?: string;
  /** → `article:published_time` (ISO date). */
  publishedTime?: string;
  /** → `article:modified_time` (ISO date). */
  modifiedTime?: string;
  [property: string]: string | undefined;
}

/** `twitter:*` values with typed keys; the same escape hatch as `OpenGraphMeta`. */
export interface TwitterMeta {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player';
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  image?: string;
  /** → `twitter:image:alt`. */
  imageAlt?: string;
  [property: string]: string | undefined;
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
  /** Typed directives, or the raw content string. */
  robots?: string | RobotsMeta;
  /** `og:*` values, unprefixed keys (`{ type: 'article' }`). Overrides the derived ones. */
  og?: OpenGraphMeta;
  /** `twitter:*` values, unprefixed keys (`{ site: '@janux' }`). Overrides the derived ones. */
  twitter?: TwitterMeta;
  /** One `<script type="application/ld+json">` per entry. */
  jsonLd?: unknown | unknown[];
  head?: HeadTag[];
}
