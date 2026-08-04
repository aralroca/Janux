import { applyEdits, collect, parseModule, spanOf, type SpanEdit } from '../ast';
import { SOURCE_FILE, type Codemod, type CodemodInput, type CodemodResult } from '../types';

/**
 * `next/*` imports, translated where Janux has the same thing and reported
 * where it does not.
 *
 * Most of this list has no mapping, and that is the honest result: `next/link`
 * exists because Next needs a component to own client navigation, and Janux
 * does not — an `<a href>` is already a client navigation. Rewriting `<Link>`
 * into `<a>` is a JSX change with props (`prefetch`, `replace`, `scroll`) that
 * do not survive it, so the codemod removes the now-unused import and names the
 * file, rather than half-translating the markup.
 *
 * The bare `'next'` specifier is deliberately not handled here: it carries
 * types, and `next/metadata` already repoints the one that matters.
 */

const NEXT_SUBMODULE = /^next\//;

interface ModuleMapping {
  /** Where the names that survive come from. */
  to?: string;
  /** Next's export name (`default` for a default import) → the Janux name. */
  names?: Record<string, string>;
  /** Why the rest cannot come along. */
  note: string;
}

const NEXT_MODULES: Record<string, ModuleMapping> = {
  'next/image': {
    to: 'janux',
    names: { default: 'Image' },
    note: '`Image` sizes from `IMAGE_WIDTHS` and needs no loader config; `placeholder`/`blurDataURL` have no equivalent.',
  },
  'next/link': {
    note: 'A Janux link is a plain `<a href>` — navigation is delegated, and hovering it prefetches. Replace `<Link>` with `<a>`; `prefetch`, `replace` and `scroll` are configured in `janux.config.ts`, not per link.',
  },
  'next/navigation': {
    to: 'janux',
    names: { notFound: 'notFound' },
    note: 'Janux has no navigation hooks: a route reads `params` and `url` from its own arguments, and client state that belongs in the URL goes through `urlState()`.',
  },
  'next/server': {
    note: 'A Janux handler returns a plain `Response`, so `NextResponse.json(x)` is `Response.json(x)` and `NextResponse.redirect(u)` is `Response.redirect(u)`.',
  },
  'next/head': {
    note: '`<Head>` has no equivalent: a page describes its head with `export const meta`, and anything the fields do not cover goes in `meta.head`.',
  },
  'next/dynamic': {
    note: '`dynamic()` has no equivalent: a Janux island is already loaded on interaction, and a suspended one declares `suspense:` on its `component()`.',
  },
  'next/font/google': {
    note: 'Fonts are declared in `janux.config.ts` and served self-hosted; see the fonts guide.',
  },
  'next/cache': {
    note: '`revalidateTag`/`revalidatePath` come from `@janux/server`, and per-route caching is `cachePolicy`.',
  },
};

/** The name this specifier imports, with `default` standing for a default import. */
function importedName(specifier: any): string {
  if (specifier.type === 'ImportDefaultSpecifier') return 'default';

  return specifier.imported?.value ?? specifier.local?.value ?? '';
}

/** `Image`, or `Image as NextImage` when the file bound it to another name. */
function rendered(specifier: any, janux: string): string {
  const local = specifier.local?.value;

  return local && local !== janux ? `${janux} as ${local}` : janux;
}

interface Translation {
  kept: string[];
  dropped: string[];
}

function translate(declaration: any, mapping: ModuleMapping): Translation {
  const names = mapping.names ?? {};
  const specifiers: any[] = declaration.specifiers ?? [];
  const paired = specifiers.map((specifier) => ({ specifier, janux: names[importedName(specifier)] }));

  return {
    kept: paired.filter((entry) => entry.janux).map((entry) => rendered(entry.specifier, entry.janux!)),
    dropped: paired.filter((entry) => !entry.janux).map((entry) => entry.specifier.local?.value ?? importedName(entry.specifier)),
  };
}

/**
 * The declaration's range, plus the newline it sat on. Without the newline a
 * removed import leaves a blank line behind, and a codemod that reformats
 * around what it deleted is one nobody reads the diff of twice.
 */
function removalSpan(code: string, node: any, base: number): { start: number; end: number } {
  const { start, end } = spanOf(node, base);
  const rest = Buffer.from(code, 'utf8').subarray(end).toString('utf8');
  const newline = /^\r?\n/.exec(rest);

  return { start, end: end + (newline ? Buffer.byteLength(newline[0]) : 0) };
}

interface Rewrite {
  edits: SpanEdit[];
  notes: string[];
}

function rewriteOne(code: string, declaration: any, base: number): Rewrite {
  const source = declaration.source.value as string;
  const mapping = NEXT_MODULES[source];

  if (!mapping) return { edits: [], notes: [`\`${source}\` has no Janux equivalent — this import needs a decision.`] };
  const { kept, dropped } = translate(declaration, mapping);
  const note = dropped.length > 0 ? [`\`${source}\` (${dropped.join(', ')}): ${mapping.note}`] : [];

  return { edits: [replacement(code, declaration, base, kept, mapping)], notes: note };
}

/** Either the surviving names, re-sourced from Janux, or the whole line gone. */
function replacement(code: string, declaration: any, base: number, kept: string[], mapping: ModuleMapping): SpanEdit {
  if (kept.length === 0) return { ...removalSpan(code, declaration, base), text: '' };

  return { ...spanOf(declaration, base), text: `import { ${kept.join(', ')} } from '${mapping.to}';` };
}

export const nextImports: Codemod = {
  id: 'next/imports',
  title: 'Next imports',
  description: 'Repoints the `next/*` imports Janux has an equivalent for, and names the ones it does not.',
  appliesTo: (file: string) => SOURCE_FILE.test(file),
  run({ code, file }: CodemodInput): CodemodResult {
    const parsed = parseModule(code, file);

    if (!parsed) return {};
    const rewrites = collect(parsed.module, 'ImportDeclaration')
      .filter((declaration: any) => NEXT_SUBMODULE.test(declaration.source?.value ?? ''))
      .map((declaration: any) => rewriteOne(code, declaration, parsed.base));
    const edits = rewrites.flatMap((rewrite) => rewrite.edits);
    const notes = rewrites.flatMap((rewrite) => rewrite.notes);

    return { ...(edits.length > 0 ? { code: applyEdits(code, edits) } : {}), ...(notes.length > 0 ? { notes } : {}) };
  },
};
