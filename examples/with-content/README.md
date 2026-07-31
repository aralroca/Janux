# with-content

A content site built on `@janux/content`: a directory of notes whose frontmatter is validated by the framework's own `schema()`, rendered as Markdown or as MDX embedding real components.

```bash
bun install
bun run dev     # http://localhost:4321
bun run build   # prerenders every published note into dist/client
```

## What it demonstrates

**Frontmatter validated by the same schema as component state.** `src/content.ts` declares the collection with `str()`, `list()` and `bool()` — the builders that describe an island's state — and every file's header goes through `validate()`, the function that runs on every intent call. A note missing its `title` fails the build with the file name and the field; it does not ship a page whose `<title>` reads `undefined`.

**Typed entries, no codegen.** `getCollection(notes)` returns entries whose `data` is inferred from the schema, so `note.data.tags` is a `string[]` and renaming a field stops the build.

**MDX that embeds real components.** `interactive-content.mdx` mounts a `component()` — server-rendered, resumable, and with its `vote` intent on the manifest, so an agent can vote through the tool a reader clicks. `charting-with-react.mdx` mounts a React component unchanged through `foreign()`. Both are ordinary tags from the note's side.

**Markdown stays markdown.** `.md` files are compiled as markdown, so `{ braces }` and raw `<figure>` blocks are what the author wrote. `.mdx` opts into the other reading, by extension.

**0 KB where there is nothing to run.** MDX is compiled on the server, at build time. A note of prose prerenders to an HTML file with no scripts in it; only the notes that embed a component link the runtime.

**One list feeds everything.** `draft: true` is a schema field, so a single filter keeps a note out of the index, `staticParams`, the prerender, the sitemap and `llms.txt` at once — `content/notes/still-a-draft.md` is the newest file in the collection and appears nowhere.

**The agent face, from the same build.** Every note answers at `/notes/<slug>.md` as clean markdown, and `/llms.txt` indexes them.

## Layout

```
content/notes/     the collection — .md and .mdx
src/content.ts     defineCollection + the components a note may mount
src/components/    Poll (Janux island) and Trend (React via foreign())
src/routes/        index, notes/[slug], _404
```
