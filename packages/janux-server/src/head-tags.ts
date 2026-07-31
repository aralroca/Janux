import type { HeadTag, PageMeta } from 'janux';
import { nonceAttr, safeAttr, safeJson } from './html-escape';

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
  /** CSP nonce: JSON-LD is a data block, but a strict policy still sees a `<script>`. */
  nonce?: string;
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

const NO_ENTRIES: Record<string, string> = {};

/** Unprefixed keys are the contract (`{ type: 'article' }`), but an already-prefixed key still works. */
function unprefixed(entries: Record<string, string> | undefined, prefix: string): Record<string, string> {
  if (!entries) return NO_ENTRIES;
  const marker = `${prefix}:`;

  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key.startsWith(marker) ? key.slice(marker.length) : key, value]),
  );
}

function tag(attr: 'property' | 'name', prefix: string, key: string, content: string): string {
  const name = safeAttr(`${prefix}:${key}`);

  return `<meta ${attr}="${name}" id="jx-${safeAttr(prefix)}-${safeAttr(key)}" content="${safeAttr(content)}">`;
}

function cardTags(attr: 'property' | 'name', prefix: string, values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([, content]) => content !== '')
    .map(([key, content]) => tag(attr, prefix, key, content))
    .join('');
}

// Empty values are dropped by `cardTags`, so an absent url/image needs no
// conditional spread — `''` says the same thing and reads the same as the rest.
function openGraph(meta: PageMeta, ctx: HeadContext, image?: string, url?: string): string {
  const derived = {
    type: 'website',
    title: meta.title ?? ctx.title ?? '',
    description: meta.description ?? ctx.description ?? '',
    url: url ?? '',
    image: image ?? '',
  };

  return cardTags('property', 'og', { ...derived, ...unprefixed(meta.og, 'og') });
}

function twitterCard(meta: PageMeta, ctx: HeadContext, image?: string): string {
  const derived = {
    card: image ? 'summary_large_image' : 'summary',
    title: meta.title ?? ctx.title ?? '',
    description: meta.description ?? ctx.description ?? '',
    image: image ?? '',
  };

  return cardTags('name', 'twitter', { ...derived, ...unprefixed(meta.twitter, 'twitter') });
}

function jsonLdScripts(jsonLd: PageMeta['jsonLd'], nonce?: string): string {
  const entries = jsonLd === undefined ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  const cspAttr = nonceAttr(nonce);

  return entries
    .map(
      (entry, index) =>
        `<script type="application/ld+json" id="jx-jsonld-${index}"${cspAttr}>${safeJson(entry)}</script>`,
    )
    .join('');
}

/** The full HTML void set, not just the head's usual three: `head` takes any tag. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/**
 * `style` and `script` are raw text: the browser does not decode entities inside
 * them, so escaping their content corrupts it rather than protecting it — CSS
 * nesting (`&`), a `<` in a media query, a quoted font name. Only the closing
 * sequence can end the element, and a backslash before the slash is valid in
 * both CSS strings and JavaScript.
 */
const RAW_TEXT_TAGS = new Set(['style', 'script']);

function content(name: string, text: string): string {
  return RAW_TEXT_TAGS.has(name) ? text.replace(/<\/(?=[a-z])/gi, '<\\/') : safeAttr(text);
}

/**
 * A route's own head tag. `script` and `style` get the request nonce like every
 * other tag the shell emits: the app cannot write it itself (it is minted per
 * request), and without it a strict policy simply refuses the tag.
 */
function customTag(nonce: string | undefined, { tag: name, attrs, text }: HeadTag, index: number): string {
  const id = attrs?.id ?? `jx-head-${index}`;
  const rendered = Object.entries({ ...attrs, id })
    .map(([key, value]) => ` ${safeAttr(key)}="${safeAttr(value)}"`)
    .join('');
  const cspAttr = RAW_TEXT_TAGS.has(name) ? nonceAttr(nonce) : '';

  if (VOID_TAGS.has(name)) return `<${safeAttr(name)}${rendered}>`;

  return `<${safeAttr(name)}${rendered}${cspAttr}>${content(name, text ?? '')}</${safeAttr(name)}>`;
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
    jsonLdScripts(meta.jsonLd, ctx.nonce),
    (meta.head ?? []).map((tag, index) => customTag(ctx.nonce, tag, index)).join(''),
  ].join('');
}
