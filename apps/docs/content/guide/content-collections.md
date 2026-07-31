---
title: Content collections
description: "A directory of Markdown or MDX files whose frontmatter is validated by the same schema system that types component state, with typed entries and no codegen."
---

# Content collections

A content site is one of the two archetypes Janux is built for, and `@janux/content` is the primitive that serves it. A **collection** is a directory of Markdown or MDX files whose frontmatter is validated by `schema()` — the same builders and the same `validate()` that check an island's state and an intent's input.

That is the whole argument for it: in Janux, content and state are validated by one implementation, not by two that agree until they don't.

```bash
bun add @janux/content
```

> **Note:** the runnable version of this page is [`examples/with-content`](https://github.com/aralroca/Janux/tree/main/examples/with-content).

## Declaring a collection

```ts title="src/content.ts"
import { defineCollection } from '@janux/content';
import { bool, list, schema, str } from 'janux';

export const notes = defineCollection({
  dir: 'content/notes',
  schema: schema({
    title: str(),
    date: str(),
    summary: str(),
    tags: list(str()).default([]),
    draft: bool().default(false),
  }),
});
```

`dir` is where the files live: absolute, or relative to the app root the framework publishes (`JANUX_APP_ROOT`), which is what makes the same path work under `janux dev`, `janux start` and a bundled deployment. It is resolved once, when the module is loaded.

There is no registry and no generated types file. `defineCollection` returns the collection, and you pass that object to everything else — so the entries you get back are typed by the schema you just wrote.

## Reading entries

```tsx
import { getCollection, getEntry } from '@janux/content';
import { notes } from '../content';

const published = getCollection(notes, (note) => !note.data.draft);
const one = getEntry(notes, 'hello-world');
```

Both are synchronous, so a `staticParams()` can enumerate the collection directly:

```ts
export const staticParams = () => getCollection(notes).map((note) => ({ slug: note.id }));
```

Every entry carries:

| Field | What it is |
|---|---|
| `id` | The path inside the collection with the extension dropped — `guide/schema`. Nested directories give nested ids. |
| `data` | The **validated** frontmatter, typed by the schema. |
| `body` | The file's content with the frontmatter block removed. |
| `format` | `'md'` or `'mdx'`. |
| `file` | Absolute path of the source file. |

## Typed frontmatter, checked at build time

`data` is inferred from the schema, so a page reads fields instead of guessing at them:

```tsx
<h1>{note.data.title}</h1>
<time dateTime={note.data.date}>{note.data.date}</time>
```

Rename a field and the page stops compiling. Forget one in a content file and the build fails, naming the file and the field:

```
Janux content: invalid frontmatter in /app/content/notes/hello.md
  title: required
  date: expected string
```

Defaults, `optional()` and `nullable()` behave exactly as they do in component state, because it is the same `validate()`. Frontmatter is parsed with YAML's core schema, so `date: 2026-07-01` stays the ISO **string** the author wrote — the schema layer has no date kind, and a silently-converted value would fail against `str()`.

## Rendering a body

`render()` compiles an entry into a Janux component:

```tsx
import { render } from '@janux/content';

export default async function NotePage({ params }: { params: { slug: string } }) {
  const note = getEntry(notes, params.slug)!;
  const { Content, headings } = await render(note);

  return (
    <article>
      <h1>{note.data.title}</h1>
      <Content />
    </article>
  );
}
```

`headings` is every heading in document order (`{ depth, id, text }`), with the ids already stamped on the rendered elements — so a table of contents and the anchors it links to are the same strings by construction.

Rendering is optional. An app with its own markdown pipeline can take `entry.body` and do what it likes with it; this documentation site does exactly that.

## MDX: components inside content

A `.mdx` file may mount components. What it may mount is decided by the page that renders it, not by the file:

```tsx
const { Content } = await render(note, { components: { Poll, Trend } });
```

```mdx title="content/notes/interactive.mdx"
---
title: An island written inside a note
---

The paragraph you are reading is markdown. The poll below is a real island.

<Poll initial={{ question: 'Which part sold you?', options: [] }} />
```

A capitalised key is a component the body can mount — a `component()` becomes a real island, and a [`foreign()`](/docs/guide/interop) wrapper mounts React unchanged. A lowercase key overrides an element (`h2`, `code`, `a`), which is how an app applies its own chrome to markdown it did not write.

An island mounted from content is an island like any other: it server-renders, it resumes without hydrating the page around it, and its intents are on the [manifest](/docs/guide/agent-and-copilot) — so an agent reading the page can call `poll.vote` while a reader clicks it.

### `.md` is markdown, `.mdx` is MDX

The extension chooses the reading, and the difference matters for an existing corpus:

- In `.md`, `{ braces }` are prose and raw HTML like `<figure>` is passed through as written.
- In `.mdx`, both are JSX.

## The compiler never reaches the browser

MDX is compiled and evaluated on the server, with Janux's own JSX runtime. With `output: 'static'` that happens once, at build time, and the prerendered page is HTML. A note of prose ships **0 KB**; only the notes that embed a component link the runtime at all.

The compiler is behind a dynamic import, so an app that writes only `.md` never loads it either.

## What a collection gives the agent face for free

Nothing here is special-cased for content. Because the notes are ordinary pages, the [`.md` projection](/docs/getting-started/the-agentic-web) answers at `/notes/<slug>.md`, `llms.txt` indexes them, and the sitemap lists them — all derived from the same `staticParams` that enumerates the collection. One filter, such as `draft: true`, removes a page from every one of them at once.

## Related

- [Schema types](/docs/guide/schema) — the builders and the validation semantics this reuses.
- [Content API reference](/docs/reference/content-api) — every export, in detail.
- [Foreign-UI interop](/docs/guide/interop) — how the React components an MDX file mounts get there.
