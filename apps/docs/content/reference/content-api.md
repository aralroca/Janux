---
title: Content API
description: "Everything importable from the content package: collection definition, entry lookup, Markdown and MDX rendering, and the frontmatter primitives underneath them."
---

# Content API

Everything importable from `@janux/content`. Guide: [Content collections](/docs/guide/content-collections).

```ts
import {
  defineCollection,
  getCollection,
  getEntry,
  render,
  slugify,
  parseFrontmatter,
  splitFrontmatter,
  validateFrontmatter,
} from '@janux/content';
```

## defineCollection(config)

Declares a collection and returns it. There is no registry: the returned object is what you pass to `getCollection` and `getEntry`, which is what makes the entries typed without a codegen step.

```ts
import { defineCollection } from '@janux/content';
import { list, schema, str } from 'janux';

export const notes = defineCollection({
  dir: 'content/notes',
  schema: schema({ title: str(), tags: list(str()).default([]) }),
});
```

| Option | Meaning |
|---|---|
| `dir` | Where the files live. Absolute, or relative to the app root (`JANUX_APP_ROOT`, published by the framework; the working directory otherwise). Resolved once, when this call runs. |
| `schema` | A [schema](/docs/guide/schema) validating every file's frontmatter. `Infer` of it is what `entry.data` reads as. |

Files ending in `.md` and `.mdx` are content; anything else in the directory is ignored. Two files that resolve to the same id (`a.md` and `a.mdx`) throw.

## getCollection(collection, filter?)

Every entry, ordered by `id`. The optional filter runs on validated data, so it is a plain predicate over typed fields.

```ts
const published = getCollection(notes, (note) => !note.data.draft);
```

Synchronous, so it can feed `staticParams()`. A directory that does not exist is empty, not an error; a file whose frontmatter fails the schema throws, naming the file and every bad field.

## getEntry(collection, id)

One entry by `id`, or `undefined`.

```ts
const note = getEntry(notes, 'guide/schema');
```

Ids come from URLs, so they are matched against the collection's own listing rather than joined onto a path: `../secrets` finds nothing.

### CollectionEntry

| Field | Type | What it is |
|---|---|---|
| `id` | `string` | Path inside the collection, extension dropped, POSIX separators. |
| `data` | `Infer<schema>` | Validated frontmatter. |
| `body` | `string` | Content with the frontmatter block removed. |
| `format` | `'md' \| 'mdx'` | Which reading the file gets. |
| `file` | `string` | Absolute path of the source file. |

`CollectionEntry<typeof notes>` is the type of one entry — parameterised by the collection, not by its schema.

## render(entry, options?)

Compiles an entry's body into a Janux component. Async, cached by the body's own source.

```tsx
const { Content, headings } = await render(note, { components: { Poll } });
```

| Returns | What it is |
|---|---|
| `Content` | The body as a component: `<Content />`. |
| `headings` | `{ depth, id, text }[]` in document order, with the same ids stamped on the rendered elements. |

`options.components` maps names the content may use. A capitalised key is a component the body can mount — a `component()` becomes a real island, a [`foreign()`](/docs/reference/foreign) mounts React unchanged. A lowercase key overrides an element (`h2`, `code`, `a`).

Compilation happens on the server: no MDX runtime reaches the browser, and with `output: 'static'` it happens once, at build time.

The compiler is an **optional peer dependency** — `bun add @mdx-js/mdx`. Collections do not need it; only `render()` does, and calling it without the compiler installed says so.

## slugify(text)

The heading-id function `render` uses. Exported so an app can produce the same id for a heading it writes itself.

```ts
slugify('Deep, with punctuation!'); // 'deep-with-punctuation'
```

## parseFrontmatter(source)

Splits a file into `{ data, body }` and parses the frontmatter block as YAML. Nothing is validated — this is the layer underneath a collection, for tooling that needs the raw fields.

```ts
const { data, body } = parseFrontmatter('---\ntitle: Hi\n---\n# Hi\n');
```

Parsed with YAML's core schema, so `2026-07-01` stays a string rather than becoming a `Date` the schema layer has no kind for.

## splitFrontmatter(source)

Just the split: `{ yaml, body }`, with `yaml` undefined when the file opens with content. Only column 0 of line 1 opens a block; a `---` anywhere else is a thematic break. An unterminated block throws rather than being read as body.

## validateFrontmatter(schema, data, file)

Validates parsed frontmatter and returns the typed value, or throws an error naming the file and every failing field. This is the framework's own `validate()` — the same function [intents](/docs/guide/intents-and-guards) run their input through.

```ts
const data = validateFrontmatter(schema({ title: str() }), { title: 'Hi' }, 'content/hi.md');
```
