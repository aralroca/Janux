---
title: Migrating from Astro
description: The content layer translates almost exactly, the endpoints translate cleanly, and every .astro template is a hand rewrite. What that costs, honestly.
---

# Migrating from Astro

Astro and Janux agree about more than Astro and most frameworks do: server-rendered HTML by default, no JavaScript unless something on the page needs it, islands for the parts that do. That agreement is why the content layer ports almost verbatim — and it is also why the remaining difference is stark. **`.astro` is a template language, and Janux does not run it.** Every page template is a hand rewrite into TSX.

There is no way to make that number smaller, so this page is about deciding whether the rest is worth it.

## Run the codemods

Every codemod takes `--dry-run`, which prints the diff and writes nothing.

```bash
janux codemod astro/routes --dry-run   # src/pages endpoints → src/api, and a destination for every template
janux codemod astro/content --dry-run  # astro:content → @janux/content, and the Zod schema → the Janux one
```

`astro/routes` deliberately does **not** move `.astro` files. Dropping one into `src/routes` would produce a tree that looks migrated and does not build. What it does instead is name the file each template becomes, so the rewrite has somewhere to go:

```txt
! src/pages/blog/[slug].astro: `.astro` is a template language Janux does not run — rewrite this page as `src/routes/blog/[slug].tsx`.
! src/pages/404.astro: … rewrite this page as `src/routes/_404.tsx`.
```

## What translates

### Content collections

This is the closest correspondence in either migration, because Janux took the API from Astro on purpose. `defineCollection`, `getCollection` and `getEntry` keep their names, their arguments and their meaning; only the schema changes hands, from Zod to the same `schema()` that types component state.

```ts
import { defineCollection } from '@janux/content';
import { bool, list, schema, str } from 'janux';

export const blog = defineCollection({
  dir: 'src/content/blog',
  schema: schema({
    title: str(),
    description: str().optional(),
    draft: bool().default(false),
    tags: list(str()),
  }),
});
```

The modifiers do not even change spelling: `.optional()`, `.nullable()`, `.default()`, `.min()` and `.max()` mean the same thing on both sides, so a chain survives the codemod untouched. The builders map one to one — `z.string()` → `str()`, `z.number()` → `num()`, `z.boolean()` → `bool()`, `z.array()` → `list()`, `z.object()` → `obj()`, `z.enum()` → `enums()`.

What has no equivalent is reported rather than guessed at. `z.date()` is the common one: Janux has no date builder, so keep the value a string and parse it where you read it. `z.union()`, `z.record()` and `z.any()` are the same story — the schema system is deliberately small, because it is also what serializes state, projects JSON Schema for agents and validates every tool call.

Your frontmatter does not change at all. Neither does the directory of Markdown.

### Endpoints

An Astro endpoint already exports functions named by HTTP method that return a `Response`, which is exactly Janux's contract, so `src/pages/api/posts.ts` moves to `src/api/posts.ts` and works. Relative imports are rebased with it.

One difference: Janux mounts the whole handler tree under `/api`. An endpoint Astro served at the root — `src/pages/rss.xml.ts` — answers `/api/rss.xml` after the move, and the codemod says so per file. If the URL matters, route it in `src/middleware.ts` or accept the new one.

### Routing

The segment grammar carries over: `[slug]` and `[...path]` mean the same thing. What changes is the directory and the extension.

| Astro | Janux |
|---|---|
| `src/pages/index.astro` | `src/routes/index.tsx` |
| `src/pages/blog/[slug].astro` | `src/routes/blog/[slug].tsx` |
| `src/pages/404.astro` | `src/routes/_404.tsx` |
| `src/pages/api/posts.ts` | `src/api/posts.ts` |
| `src/layouts/Base.astro` | `src/routes/_layout.tsx` |
| `src/content/config.ts` | Anywhere — a collection is a value, not a file convention |

Markdown pages under `src/pages` are the exception: in Janux, Markdown is collection content rendered by a route, not a page in itself. Move it into a collection directory and give it a route that reads it. The [blog example](https://github.com/aralroca/Janux/tree/main/examples/blog-static) is that shape end to end.

## What does not translate

**Every `.astro` file.** The frontmatter fence becomes ordinary code at the top of a route module, and the template becomes TSX. Mechanically the two are close — both are "run this on the server, emit this HTML" — but they are different syntaxes and no codemod bridges them honestly.

A rough phrasebook:

| Astro | Janux |
|---|---|
| `---` frontmatter fence | Plain statements in the route module, before the returned JSX |
| `Astro.props` | The component's arguments |
| `Astro.params` | `params`, passed to the route |
| `Astro.request` | `req` on a handler; `ctx` for per-request context |
| `<slot />` | `children` |
| `<style>` in a component | A CSS file, a CSS Module, or `<style>` in JSX — see [Styles](/docs/styles/overview) |
| `class:list` | An ordinary `class` expression |
| `set:html` | Not available: escaping is not opt-out per node |
| `client:load`, `client:idle`, `client:visible` | Nothing to write: an island resumes on interaction, and `janux build` decides what ships |

That last row is the one worth pausing on. Astro's `client:*` directives exist because hydration is expensive and you are choosing when to pay. Janux resumes instead of hydrating: the island's state travels in the HTML and the first interaction wakes it, so there is no per-component hydration budget to allocate and no directive to pick. The concept goes away rather than getting a new spelling.

Also absent:

- **Astro integrations.** The ecosystem does not transfer. Tailwind, Sass, MDX and images are built in ([Tailwind](/docs/styles/tailwind), [Sass](/docs/styles/sass), [content](/docs/guide/content-collections), [images](/docs/guide/images)); anything else is your own code.
- **View Transitions / `<ClientRouter />`.** Janux navigates client-side by default and streams the new page in — there is nothing to opt into.
- **Multi-framework islands.** Janux mounts React through [`foreign()`](/docs/guide/interop). Vue, Svelte and Solid are not supported.
- **`Astro.glob`.** Use a collection.

## What you have to rethink

Astro's islands are components from another framework, mounted with a directive. Janux's islands are the framework's own component model, and they carry more than markup:

```tsx
import { component, intent, schema, str } from 'janux';

export const Search = component({
  name: 'search',
  description: 'Filters the post list. An agent can call it with the same query a person types.',
  state: schema({ query: str() }),
  intents: {
    setQuery: intent({
      description: 'Set the search query',
      input: schema({ query: str() }),
      run: ({ state, input }) => (state.query = input.query),
    }),
  },
  view: ({ state, intents }: any) => (
    <input value={state.query} onInput={intents.setQuery} placeholder="Search…" />
  ),
});
```

The `description` and `input` fields are not documentation. They are what makes this island an MCP tool as well as a text box, projected from the same definition rather than declared twice. If that is not something you want, Astro is already very good at the thing you are doing and this migration buys you little.

The honest checklist:

- **A content site with a handful of interactive widgets.** The best case. The collections port by codemod, the templates are a day or two, and you land on a zero-JS build with an agent surface.
- **A large template-heavy marketing site.** The cost is linear in `.astro` files and the codemod cannot help. Count them first.
- **You rely on Vue/Svelte islands.** Not supported. Stop here.
- **You want the agentic surface** — a hosted MCP endpoint, per-page Markdown projections, `llms.txt` — that is what the extra structure buys, and it is described in [the agent guide](/docs/guide/agent-and-copilot).

## Where to go next

- [Content collections](/docs/guide/content-collections) — the API you already know, with the Janux schema
- [Views & JSX](/docs/guide/views-and-jsx) — what replaces the template half of `.astro`
- [Mental model](/docs/getting-started/mental-model) — islands and resumability
- [Codemods & `janux upgrade`](/docs/reference/codemods)
