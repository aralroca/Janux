/**
 * Typed builders for the JSON-LD shapes a content site needs: an article, its
 * breadcrumb trail, the organization behind it. Each returns a plain object
 * for `PageMeta.jsonLd` — typed input in, schema.org naming out, absent fields
 * dropped so the emitted block never carries a `"description":undefined`.
 *
 * The result is open (`[property: string]: unknown`), so a page that needs a
 * property the input does not carry spreads it on: `{ ...articleJsonLd(x),
 * isPartOf: {...} }`.
 */

/** A schema.org node: typed enough to demand a `@type`, open to any vocabulary. */
export interface JsonLd {
  '@context': 'https://schema.org';
  '@type': string;
  [property: string]: unknown;
}

export interface ArticleLd {
  /** schema.org subtype; `Article` unless the page is more specific. */
  type?: 'Article' | 'TechArticle' | 'BlogPosting' | 'NewsArticle';
  headline: string;
  description?: string;
  /** Absolute page URL. */
  url?: string;
  /** Absolute image URL. */
  image?: string;
  /** ISO date, as content collections store it. */
  datePublished?: string;
  dateModified?: string;
  /** → `articleSection`. */
  section?: string;
  author?: { name: string; url?: string };
}

export interface BreadcrumbLd {
  name: string;
  /** Absolute URL. Omit where the crumb has no page — validators require that on the last one. */
  url?: string;
}

export interface OrganizationLd {
  name: string;
  /** Absolute homepage URL. */
  url?: string;
  /** Absolute logo URL. */
  logo?: string;
  /** Profile URLs that identify the same organization (repository, social accounts). */
  sameAs?: string[];
}

function compact<T extends Record<string, unknown>>(node: T): T {
  return Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined)) as T;
}

export function articleJsonLd({ type, section, author, ...rest }: ArticleLd): JsonLd {
  return compact({
    '@context': 'https://schema.org',
    '@type': type ?? 'Article',
    ...rest,
    articleSection: section,
    author: author && compact({ '@type': 'Person', ...author }),
  });
}

export function breadcrumbJsonLd(crumbs: BreadcrumbLd[]): JsonLd & { itemListElement: Record<string, unknown>[] } {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(({ name, url }, index) =>
      compact({ '@type': 'ListItem', position: index + 1, name, item: url }),
    ),
  };
}

export function organizationJsonLd(organization: OrganizationLd): JsonLd {
  return compact({ '@context': 'https://schema.org', '@type': 'Organization', ...organization });
}
