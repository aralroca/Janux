import { textOf, type SpanEdit } from '../ast';
import { entries, entryNamed, keyOf, removeEntry, renameKey, replaceValue } from '../object-edits';

/**
 * The field-by-field difference between Next's `Metadata` and Janux's
 * `PageMeta`, as edits over the object literal.
 *
 * `PageMeta` keeps the flat shape the emitted tags have, so the translation is
 * mostly un-nesting: one `og:image`, not an `images` array; `canonical` at the
 * top level, not under `alternates`.
 */

/** Every field `PageMeta` carries. Anything else in the literal is reported, not guessed at. */
const PAGE_META_KEYS = new Set(['title', 'description', 'image', 'canonical', 'robots', 'og', 'twitter', 'jsonLd', 'head']);

/** Same field, different name. */
const RENAMED = new Map([['openGraph', 'og']]);

/** Fields Janux answers somewhere other than a page's `meta`. Dropped, with the reason. */
const ELSEWHERE = new Map([
  ['metadataBase', 'Dropped `metadataBase`: Janux resolves root-relative `image`/`canonical` against `siteUrl` in `janux.config.ts`.'],
]);

/** What a key Janux has no field for should do instead. */
const NO_FIELD: Record<string, string> = {
  keywords: 'add a `<meta name="keywords">` through `meta.head`',
  icons: 'link the icon from `meta.head`, with the file in `public/`',
  viewport: 'the shell already emits the standard viewport tag',
  themeColor: 'add it through `meta.head`',
  verification: 'add the verification tags through `meta.head`',
  authors: 'add the author tags through `meta.head`, or put them in `meta.jsonLd`',
};

/** The literal a single-image array collapses to, when it is one plain string. */
function singleImage(value: any): any | undefined {
  const first = value?.type === 'ArrayExpression' && value.elements?.length === 1 ? value.elements[0]?.expression : undefined;

  return first?.type === 'StringLiteral' || first?.type === 'TemplateLiteral' ? first : undefined;
}

/** `images: ['/og.png']` → `image: '/og.png'`, inside `og` and `twitter` alike. */
function imageEdits(property: any, code: string, base: number): SpanEdit[] {
  const images = property?.value?.type === 'ObjectExpression' ? entryNamed(property.value, 'images') : undefined;

  if (!images) return [];
  const only = singleImage(images.value);

  return [renameKey(images, 'image', base), ...(only ? [replaceValue(images, textOf(code, only, base), base)] : [])];
}

/** `alternates: { canonical: '/x' }` → `canonical: '/x'`, which is where `PageMeta` keeps it. */
function alternatesEdits(object: any, code: string, base: number): SpanEdit[] {
  const alternates = entryNamed(object, 'alternates');
  const canonical = alternates?.value?.type === 'ObjectExpression' ? entryNamed(alternates.value, 'canonical') : undefined;

  if (!canonical || entries(alternates.value).length !== 1) return [];

  return [renameKey(alternates, 'canonical', base), replaceValue(alternates, textOf(code, canonical.value, base), base)];
}

/** Keys that only change name. */
function renameEdits(object: any, base: number): SpanEdit[] {
  return entries(object).flatMap((property) => {
    const renamed = RENAMED.get(keyOf(property) ?? '');

    return renamed ? [renameKey(property, renamed, base)] : [];
  });
}

/** Keys Janux answers elsewhere, removed so the literal still typechecks. */
function dropEdits(object: any, code: string, base: number): SpanEdit[] {
  return [...ELSEWHERE.keys()].flatMap((name) => {
    const property = entryNamed(object, name);

    return property ? [removeEntry(object, property, base, code)] : [];
  });
}

/** The renames, un-nestings and deletions the literal needs. */
export function metaObjectEdits(object: any, code: string, base: number): SpanEdit[] {
  if (!object) return [];
  const social = ['openGraph', 'og', 'twitter'].flatMap((name) => imageEdits(entryNamed(object, name), code, base));

  return [...renameEdits(object, base), ...social, ...alternatesEdits(object, code, base), ...dropEdits(object, code, base)];
}

/** What the literal carried that `PageMeta` cannot, and what to do with it instead. */
export function unsupportedKeys(object: any): string[] {
  if (!object) return [];

  return entries(object).flatMap((property) => {
    const key = keyOf(property) ?? '';
    const moved = ELSEWHERE.get(key);

    if (moved) return [moved];
    if (PAGE_META_KEYS.has(key) || RENAMED.has(key) || key === 'alternates') return [];

    return [`\`${key}\` has no \`PageMeta\` field — ${NO_FIELD[key] ?? 'carry it through `meta.head`'}.`];
  });
}
