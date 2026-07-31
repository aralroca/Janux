import { pathToFileURL } from 'node:url';
import * as runtime from 'janux/jsx-runtime';
import type { JanuxNode } from 'janux';
import type { CollectionDef, CollectionEntry, ContentFormat } from './collection';
import { collectHeadings, type Heading } from './headings';

export type { Heading } from './headings';

/**
 * Rendering a content entry: Markdown and MDX compiled to Janux JSX.
 *
 * MDX is compiled and evaluated **here, on the server**, with Janux's own JSX
 * runtime — which is why a `<Counter />` written in a post comes out of
 * `renderToString` as a real island, and why a page of prose still ships 0 KB.
 * The compiler is reached through a dynamic import so it never enters an app's
 * client graph, and an app that only writes `.md` never loads it either.
 */

export interface RenderOptions {
  /**
   * What the content may name. A capitalised key is a component the body can
   * mount — a Janux `component()` becomes an island, a `foreign()` mounts React
   * unchanged. A lowercase key overrides an element (`h2`, `code`, `a`), which
   * is how an app applies its own chrome to markdown it did not write.
   */
  components?: Record<string, unknown>;
}

export interface RenderedEntry {
  /** The body as a Janux component: `<Content />`. */
  Content: (props?: Record<string, unknown>) => JanuxNode;
  /** Every heading, in document order — a table of contents without a second parse. */
  headings: Heading[];
}

type MdxContent = (props: Record<string, unknown>) => JanuxNode;

interface Compiled {
  content: MdxContent;
  headings: Heading[];
}

/**
 * Compiled bodies, keyed by their own source. A content file changes only when
 * someone edits it, so the second visitor to a page should not pay to compile
 * it again — the same reasoning, and the same bound (the corpus), as the entry
 * cache in `collection.ts`.
 */
const compiled = new Map<string, Promise<Compiled>>();

/**
 * `format: 'md'` is not a detail: in `.md`, `{count}` and `<Widget>` are prose,
 * and compiling them as MDX would break corpora that have always been allowed
 * to write them. `.mdx` opts into the other reading explicitly, by extension.
 */
/**
 * The compiler is an optional peer, not a dependency: collections work without
 * it, `render()` is what needs it, and a package that pulls it in
 * unconditionally hands every consumer `@types/mdx` — which asks for a global
 * `JSX` namespace a plain Node project does not have, and fails its typecheck.
 */
async function mdx(): Promise<typeof import('@mdx-js/mdx')> {
  try {
    return await import('@mdx-js/mdx');
  } catch {
    throw new Error('Janux content: rendering a body needs the MDX compiler — install it with `bun add @mdx-js/mdx`.');
  }
}

async function compileBody(body: string, format: ContentFormat, file: string): Promise<Compiled> {
  const { compile, run } = await mdx();
  const { default: rehypeRaw } = await import('rehype-raw');
  const headings: Heading[] = [];
  const source = await compile(
    { value: body, path: file },
    {
      format,
      outputFormat: 'function-body',
      development: false,
      // Markdown may contain HTML, and an author who wrote `<figure>` expects a
      // figure — dropping it silently is how a migration loses content. Only in
      // `.md`: in `.mdx` those angle brackets are already JSX, and re-parsing
      // them as raw HTML is how a component turns back into text.
      remarkRehypeOptions: format === 'md' ? { allowDangerousHtml: true } : undefined,
      rehypePlugins: format === 'md' ? [rehypeRaw, collectHeadings(headings)] : [collectHeadings(headings)],
    },
  );
  const module = await run(String(source), { ...runtime, baseUrl: pathToFileURL(file).href } as any);

  return { content: module.default as MdxContent, headings };
}

function compileOnce(entry: Pick<CollectionEntry<CollectionDef<any>>, 'body' | 'format' | 'file'>): Promise<Compiled> {
  const key = `${entry.format}:${entry.body}`;
  const cached = compiled.get(key);

  if (cached) return cached;
  const pending = compileBody(entry.body, entry.format, entry.file).catch((error: unknown) => {
    throw new Error(`Janux content: ${entry.file} failed to compile\n${(error as Error).message}`, { cause: error });
  });

  compiled.set(key, pending);
  // A failed compile is not remembered: the next edit is usually the fix.
  pending.catch(() => compiled.delete(key));

  return pending;
}

/** Compiles an entry's body. `components` are bound per call; the compilation itself is shared. */
export async function render(
  entry: Pick<CollectionEntry<CollectionDef<any>>, 'body' | 'format' | 'file'>,
  options: RenderOptions = {},
): Promise<RenderedEntry> {
  const { content, headings } = await compileOnce(entry);

  return {
    Content: (props = {}) => content({ ...props, components: options.components ?? {} }),
    headings,
  };
}
