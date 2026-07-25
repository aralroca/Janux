import type { HeadTag, PageMeta } from 'janux';
import { safeAttr, safeJson } from './html-escape';

/**
 * The social/structured-data half of the document head: Open Graph, Twitter
 * cards, canonical, robots, JSON-LD, and an escape hatch for anything else.
 *
 * Every node carries a stable `id`. That is not decoration: SPA navigation
 * diffs the live head against the incoming one, and without a key the diff
 * matches by position — a page that omits one tag shifts every node after it,
 * so the browser re-resolves them. See html-shell.ts and client/navigate.ts.
 *
 * `og:*` and `twitter:*` are derived from the page's title, description, image
 * and canonical, so a route that sets those four gets a correct card for free;
 * the `og` and `twitter` maps override the derived values key by key.
 */

export interface HeadContext {
  siteUrl?: string;
  title?: string;
  description?: string;
}

let warnedAboutSiteUrl = false;

/** Once per process: a relative social URL silently dropped is worse than noisy. */
function warnMissingSiteUrl(value: string): void {
  if (warnedAboutSiteUrl) return;
  warnedAboutSiteUrl = true;
  console.warn(
    `Janux: dropped the relative meta URL "${value}" — og:image and canonical must be absolute. ` +
      'Set `siteUrl` in janux.config.ts to resolve them.',
  );
}

/** Social URLs must be absolute. Relative ones need `siteUrl`; without it they are dropped. */
export function absoluteUrl(value: string | undefined, siteUrl: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (!siteUrl) {
    warnMissingSiteUrl(value);

    return undefined;
  }

  return new URL(value, siteUrl).href;
}

/** Unprefixed keys are the contract (`{ type: 'article' }`), but an already-prefixed key still works. */
function unprefixed(entries: Record<string, string> | undefined, prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries ?? {}).map(([key, value]) => [key.replace(new RegExp(`^${prefix}:`), ''), value]),
  );
}

function tag(attr: 'property' | 'name', prefix: string, key: string, content: string): string {
  return `<meta ${attr}="${prefix}:${key}" id="jx-${prefix}-${key}" content="${safeAttr(content)}">`;
}

function cardTags(attr: 'property' | 'name', prefix: string, values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([, content]) => content !== '')
    .map(([key, content]) => tag(attr, prefix, key, content))
    .join('');
}

function openGraph(meta: PageMeta, ctx: HeadContext, image?: string, url?: string): string {
  const derived = {
    type: 'website',
    title: meta.title ?? ctx.title ?? '',
    description: meta.description ?? ctx.description ?? '',
    ...(url ? { url } : {}),
    ...(image ? { image } : {}),
  };

  return cardTags('property', 'og', { ...derived, ...unprefixed(meta.og, 'og') });
}

function twitterCard(meta: PageMeta, ctx: HeadContext, image?: string): string {
  const derived = {
    card: image ? 'summary_large_image' : 'summary',
    title: meta.title ?? ctx.title ?? '',
    description: meta.description ?? ctx.description ?? '',
    ...(image ? { image } : {}),
  };

  return cardTags('name', 'twitter', { ...derived, ...unprefixed(meta.twitter, 'twitter') });
}

function jsonLdScripts(jsonLd: PageMeta['jsonLd']): string {
  const entries = jsonLd === undefined ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd];

  return entries
    .map(
      (entry, index) =>
        `<script type="application/ld+json" id="jx-jsonld-${index}">${safeJson(entry)}</script>`,
    )
    .join('');
}

const VOID_TAGS = new Set(['link', 'meta', 'base']);

function customTag({ tag: name, attrs, text }: HeadTag, index: number): string {
  const id = attrs?.id ?? `jx-head-${index}`;
  const rendered = Object.entries({ ...attrs, id })
    .map(([key, value]) => ` ${key}="${safeAttr(value)}"`)
    .join('');

  if (VOID_TAGS.has(name)) return `<${name}${rendered}>`;

  return `<${name}${rendered}>${safeAttr(text ?? '')}</${name}>`;
}

/** Every head node a route's `meta` contributes beyond `<title>` and the description. */
export function headTags(meta: PageMeta | undefined, ctx: HeadContext): string {
  if (!meta) return '';
  const image = absoluteUrl(meta.image, ctx.siteUrl);
  const canonical = absoluteUrl(meta.canonical, ctx.siteUrl);

  return [
    canonical ? `<link rel="canonical" id="jx-canonical" href="${safeAttr(canonical)}">` : '',
    meta.robots ? `<meta name="robots" id="jx-robots" content="${safeAttr(meta.robots)}">` : '',
    openGraph(meta, ctx, image, canonical),
    twitterCard(meta, ctx, image),
    jsonLdScripts(meta.jsonLd),
    (meta.head ?? []).map(customTag).join(''),
  ].join('');
}
