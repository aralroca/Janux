import { applyEdits, collect, parseModule, spanOf, type SpanEdit } from '../ast';
import { SOURCE_FILE, type Codemod, type CodemodInput, type CodemodResult } from '../types';
import { metaObjectEdits, unsupportedKeys } from './next-metadata-object';

/**
 * Next's `metadata` export becomes Janux's `meta`.
 *
 * The two describe the same head, so most of this is renaming: the fields that
 * differ do so because `PageMeta` keeps the flat shape the tags actually have
 * (`og.image`, not `openGraph.images[0]`). What Janux has no field for is
 * reported rather than dropped — a migration that quietly loses a page's
 * `keywords` is worse than one that says it could not carry them.
 */

/** The declarators an `export const` at module top level introduces. */
function exportedDeclarators(module: any): any[] {
  return collect(module, 'ExportDeclaration').flatMap((node: any) => node.declaration?.declarations ?? []);
}

function exportedFunction(module: any, name: string): any | undefined {
  return collect(module, 'ExportDeclaration')
    .map((node: any) => node.declaration)
    .find((declaration: any) => declaration?.type === 'FunctionDeclaration' && declaration.identifier?.value === name);
}

/** The `Metadata` type reference on `const metadata: Metadata = …`, when it is annotated. */
function annotation(declarator: any): any | undefined {
  const reference = declarator?.id?.typeAnnotation?.typeAnnotation;

  return reference?.type === 'TsTypeReference' && reference.typeName?.value === 'Metadata' ? reference.typeName : undefined;
}

/**
 * The `Metadata` specifier of an `import … from 'next'`. The module's `source`
 * comes back only when `Metadata` was the whole import: repointing it at Janux
 * would otherwise take the sibling names on that line with it.
 */
function metadataImport(module: any): { local: any; source?: any } | undefined {
  const declaration = collect(module, 'ImportDeclaration').find((node: any) => node.source?.value === 'next');
  const specifier = (declaration?.specifiers ?? []).find((entry: any) => entry.local?.value === 'Metadata');

  if (!specifier) return undefined;

  return { local: specifier.local, ...(declaration.specifiers.length === 1 ? { source: declaration.source } : {}) };
}

/** Retype the annotation and, when `Metadata` was all it imported, repoint the import at Janux. */
function typeEdits(module: any, base: number): SpanEdit[] {
  const found = metadataImport(module);
  const annotated = exportedDeclarators(module).flatMap((declarator) => annotation(declarator) ?? []);
  const named = [...annotated, ...(found ? [found.local] : [])];

  return [
    ...named.map((node) => ({ ...spanOf(node, base), text: 'PageMeta' })),
    ...(found?.source ? [{ ...spanOf(found.source, base), text: "'janux'" }] : []),
  ];
}

/** `export const metadata` → `export const meta`, plus whatever its object literal needs. */
function constEdits(module: any, code: string, base: number): { edits: SpanEdit[]; notes: string[] } {
  const declarator = exportedDeclarators(module).find((entry: any) => entry.id?.value === 'metadata');

  if (!declarator) return { edits: [], notes: [] };
  const object = declarator.init?.type === 'ObjectExpression' ? declarator.init : undefined;

  return {
    edits: [{ ...spanOf(declarator.id, base), text: 'meta' }, ...metaObjectEdits(object, code, base)],
    notes: unsupportedKeys(object),
  };
}

/** Next's dynamic metadata. The name is all that can be rewritten; the signature is prose. */
const GENERATE_METADATA_NOTE =
  '`generateMetadata` is now `meta`, but the argument differs: Janux passes `{ ctx, params }` (params already resolved, not a promise) and expects a `PageMeta` back.';

function generateEdits(module: any, base: number): { edits: SpanEdit[]; notes: string[] } {
  const declaration = exportedFunction(module, 'generateMetadata');

  if (!declaration) return { edits: [], notes: [] };

  return { edits: [{ ...spanOf(declaration.identifier, base), text: 'meta' }], notes: [GENERATE_METADATA_NOTE] };
}

export const nextMetadata: Codemod = {
  id: 'next/metadata',
  title: 'Next metadata export',
  description: 'Turns `export const metadata` into `export const meta`, with the field shapes `PageMeta` uses.',
  appliesTo: (file: string) => SOURCE_FILE.test(file),
  run({ code, file }: CodemodInput): CodemodResult {
    const parsed = parseModule(code, file);

    if (!parsed) return {};
    const parts = [constEdits(parsed.module, code, parsed.base), generateEdits(parsed.module, parsed.base)];
    const edits = [...parts.flatMap((part) => part.edits), ...typeEdits(parsed.module, parsed.base)];
    const notes = parts.flatMap((part) => part.notes);

    return { ...(edits.length > 0 ? { code: applyEdits(code, edits) } : {}), ...(notes.length > 0 ? { notes } : {}) };
  },
};
