import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { Infer, JxType } from 'janux';
import { parseFrontmatter, validateFrontmatter } from './frontmatter';

/**
 * Content collections: a directory of Markdown/MDX files whose frontmatter is
 * validated by the same schema system as component state.
 *
 * There is no loader abstraction and no virtual module here on purpose. Janux
 * runs its production server and its `output: "static"` prerender under Bun
 * with no bundler in the loop, so anything that only exists inside Vite would
 * work in `dev` and vanish in `build`. Reading the directory is what works
 * everywhere the app runs.
 */

export type ContentFormat = 'md' | 'mdx';

const FORMATS: Record<string, ContentFormat> = { '.md': 'md', '.mdx': 'mdx' };

export interface CollectionConfig<S extends JxType<any>> {
  /**
   * Where the files live. Absolute, or relative to the app root
   * (`JANUX_APP_ROOT` when set, the working directory otherwise) — the same
   * convention the rest of the framework uses to find an app's files after a
   * deployment has moved them.
   */
  dir: string;
  /** Validates every file's frontmatter. `Infer` of this is what `entry.data` reads as. */
  schema: S;
}

export interface CollectionDef<S extends JxType<any>> extends CollectionConfig<S> {
  readonly kind: 'collection';
  /** `dir`, resolved to an absolute path when the collection was declared. */
  readonly root: string;
}

/**
 * A single content file: validated frontmatter, raw body, and where it came
 * from. Parameterised by the collection rather than by its schema, so an app
 * names the thing it already has: `CollectionEntry<typeof notes>`.
 */
export interface CollectionEntry<C extends CollectionDef<any>> {
  /** Path inside the collection with the extension dropped: `guide/schema`. */
  id: string;
  /** Absolute path of the source file. */
  file: string;
  format: ContentFormat;
  data: Infer<C['schema']>;
  /** The file's content with the frontmatter block removed. */
  body: string;
}

/**
 * Declares a collection. Pass the result to `getCollection`/`getEntry` — no
 * registry, no codegen.
 *
 * A relative `dir` is resolved **here**, while the module that declares it is
 * being loaded, because that is when its own app root is the current one. A
 * process serving two apps — a test run, a monorepo dev server — would
 * otherwise hand both collections whichever root was published last.
 */
export function defineCollection<S extends JxType<any>>(config: CollectionConfig<S>): CollectionDef<S> {
  return { kind: 'collection', ...config, root: collectionDir(config.dir) };
}

function collectionDir(dir: string): string {
  return isAbsolute(dir) ? dir : resolve(process.env.JANUX_APP_ROOT ?? process.cwd(), dir);
}

interface SourceFile {
  id: string;
  file: string;
  format: ContentFormat;
}

/** Every content file under the directory, as ids. Ordered so a build is reproducible. */
function sourceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return [];
  const found = readdirSync(dir, { recursive: true })
    .map(String)
    .flatMap((name) => {
      const extension = Object.keys(FORMATS).find((suffix) => name.endsWith(suffix));

      if (!extension) return [];

      return [{ id: name.slice(0, -extension.length).split(sep).join('/'), file: join(dir, name), format: FORMATS[extension]! }];
    })
    .sort((first, second) => first.id.localeCompare(second.id));

  assertUniqueIds(found);

  return found;
}

/** `a.md` and `a.mdx` answer to one URL, and picking a winner silently is a coin toss. */
function assertUniqueIds(files: SourceFile[]): void {
  const clash = files.find((file, index) => files[index + 1]?.id === file.id);

  if (clash) {
    throw new Error(`Janux content: duplicate entry id "${clash.id}" — two files in ${clash.file} resolve to it.`);
  }
}

interface CacheLine {
  mtimeMs: number;
  entry: CollectionEntry<any>;
}

/**
 * Parsed entries, keyed by path and invalidated by mtime. Content files change
 * only when someone edits them, so re-reading and re-validating on every render
 * is work the second visitor to a page should not pay for — and under `janux
 * dev` an author still sees their edit on reload.
 *
 * Per collection, not per path: `data` is the *validated* value, so two
 * collections reading one directory through different schemas must not hand
 * each other their results.
 */
const caches = new WeakMap<CollectionDef<any>, Map<string, CacheLine>>();

function cacheFor(def: CollectionDef<any>): Map<string, CacheLine> {
  const existing = caches.get(def);

  if (existing) return existing;
  const created = new Map<string, CacheLine>();

  caches.set(def, created);

  return created;
}

function readEntry<C extends CollectionDef<any>>(def: C, source: SourceFile): CollectionEntry<C> {
  const { mtimeMs } = statSync(source.file);
  const cache = cacheFor(def);
  const cached = cache.get(source.file);

  if (cached?.mtimeMs === mtimeMs) return cached.entry;
  const { data, body } = parseFrontmatter(readFileSync(source.file, 'utf8'));
  const entry: CollectionEntry<C> = {
    ...source,
    body,
    // The one cast in the module: `C` is the collection, and only its `schema`
    // field carries the shape `Infer` reads back.
    data: validateFrontmatter(def.schema, data, source.file) as CollectionEntry<C>['data'],
  };

  cache.set(source.file, { mtimeMs, entry });

  return entry;
}

/** Every entry in a collection, ordered by id. The optional filter runs on validated data. */
export function getCollection<C extends CollectionDef<any>>(
  def: C,
  filter?: (entry: CollectionEntry<C>) => boolean,
): CollectionEntry<C>[] {
  const entries = sourceFiles(def.root).map((source) => readEntry(def, source));

  return filter ? entries.filter(filter) : entries;
}

/** One entry by id, or `undefined`. Ids come from URLs, so they are matched, never joined. */
export function getEntry<C extends CollectionDef<any>>(def: C, id: string): CollectionEntry<C> | undefined {
  const source = sourceFiles(def.root).find((file) => file.id === id);

  return source && readEntry(def, source);
}
