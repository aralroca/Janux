import { applyEdits, collect, parseModule, spanOf, type SpanEdit } from '../ast';
import { SOURCE_FILE, type Codemod, type CodemodInput, type CodemodResult } from '../types';

/**
 * `astro:content` becomes `@janux/content`, and the Zod schema beside it
 * becomes the Janux one.
 *
 * This is the cleanest translation in either migration, because the collection
 * API is the one Janux took from Astro on purpose: `defineCollection`,
 * `getCollection` and `getEntry` keep their names and their meaning. Only the
 * schema changes hands — `z.string()` for `str()` — and the modifiers do not
 * even do that: `.optional()`, `.nullable()`, `.default()`, `.min()` and
 * `.max()` are spelled the same on both sides, so a chain survives untouched.
 */

const ASTRO_CONTENT = 'astro:content';
/** The frontmatter schema is the collection's own key, and reads better as `schema()` than `obj()`. */
const SCHEMA_KEY = 'schema';

/** Zod builder → the Janux builder that means the same thing. */
const BUILDERS: Record<string, string> = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  array: 'list',
  object: 'obj',
  enum: 'enums',
};

/** Every `z.<name>(…)` call in the file, with the member node that named it. */
function zodCalls(module: any): { call: any; member: any; name: string }[] {
  return collect(module, 'CallExpression')
    .filter((call: any) => call.callee?.type === 'MemberExpression' && call.callee.object?.value === 'z')
    .map((call: any) => ({ call, member: call.callee, name: call.callee.property?.value ?? '' }));
}

/** The `astro:content` import, when the file has one. */
function contentImport(module: any): any | undefined {
  return collect(module, 'ImportDeclaration').find((node: any) => node.source?.value === ASTRO_CONTENT);
}

/** Whether this call is the value of a `schema:` property — the collection's own frontmatter shape. */
function isCollectionSchema(module: any, call: any): boolean {
  return collect(module, 'KeyValueProperty').some(
    (property: any) => property.key?.value === SCHEMA_KEY && property.value === call,
  );
}

/** The Janux name a `z.<name>()` call becomes, given where it sits. */
function builderFor(module: any, call: any, name: string): string | undefined {
  const janux = BUILDERS[name];

  if (!janux) return undefined;

  return janux === 'obj' && isCollectionSchema(module, call) ? SCHEMA_KEY : janux;
}

/** The surviving specifiers of the `astro:content` import — `z` is replaced, not repointed. */
function keptSpecifiers(declaration: any): string[] {
  return (declaration.specifiers ?? [])
    .map((specifier: any) => specifier.local?.value)
    .filter((name: string) => name && name !== 'z');
}

/**
 * The one import line that replaces the `astro:content` one: whatever it
 * brought in other than `z`, re-sourced, plus the builders `z` was translated
 * into. One edit rather than two, because an insertion at the same offset as a
 * replacement is an overlap, and the two together are a single decision anyway.
 */
function importEdit(declaration: any, names: Set<string>, base: number): SpanEdit {
  const kept = keptSpecifiers(declaration);
  const lines = [
    ...(kept.length > 0 ? [`import { ${kept.join(', ')} } from '@janux/content';`] : []),
    ...(names.size > 0 ? [`import { ${[...names].sort().join(', ')} } from 'janux';`] : []),
  ];

  return { ...spanOf(declaration, base), text: lines.join('\n') };
}

interface Translation {
  edits: SpanEdit[];
  names: Set<string>;
  notes: string[];
}

function translateBuilders(module: any, base: number): Translation {
  return zodCalls(module).reduce<Translation>(
    (found, { call, member, name }) => {
      const janux = builderFor(module, call, name);

      if (!janux) return { ...found, notes: [...found.notes, unsupported(name)] };

      return { edits: [...found.edits, { ...spanOf(member, base), text: janux }], names: found.names.add(janux), notes: found.notes };
    },
    { edits: [], names: new Set<string>(), notes: [] },
  );
}

function unsupported(name: string): string {
  return `\`z.${name}()\` has no Janux builder — keep the value as \`str()\` and parse it where you read it, or model it with the builders in the schema guide.`;
}

export const astroContent: Codemod = {
  id: 'astro/content',
  title: 'Astro content collections',
  description: 'Repoints `astro:content` at `@janux/content` and rewrites the Zod frontmatter schema as a Janux one.',
  appliesTo: (file: string) => SOURCE_FILE.test(file),
  run({ code, file }: CodemodInput): CodemodResult {
    const parsed = parseModule(code, file);
    const declaration = parsed && contentImport(parsed.module);

    if (!declaration) return {};
    const { edits, names, notes } = translateBuilders(parsed!.module, parsed!.base);
    const all = [importEdit(declaration, names, parsed!.base), ...edits];

    return { code: applyEdits(code, all), ...(notes.length > 0 ? { notes } : {}) };
  },
};
