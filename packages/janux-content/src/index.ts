/**
 * `@janux/content` — typed content collections for Janux.
 *
 * A collection is a directory of Markdown/MDX files whose frontmatter is
 * validated by `schema()`, the same system that types component state and
 * intent input. Content and state are checked by one implementation, so a
 * page's metadata is as trustworthy as an island's state.
 *
 * `render()` compiles a body — Markdown, or MDX embedding Janux islands and
 * `foreign()` React — into a Janux component, on the server. Prose still ships
 * 0 KB: no compiler and no MDX runtime reach the browser.
 */
export {
  defineCollection,
  getCollection,
  getEntry,
  type CollectionConfig,
  type CollectionDef,
  type CollectionEntry,
  type ContentFormat,
} from './collection';
export { parseFrontmatter, splitFrontmatter, validateFrontmatter, type ParsedSource, type SplitSource } from './frontmatter';
export { render, type Heading, type RenderOptions, type RenderedEntry } from './render';
export { slugify } from './headings';
