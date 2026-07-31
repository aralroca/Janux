---
title: The same notes, read by machines
date: 2026-07-05
summary: Every page here answers twice — as HTML for a reader, and as clean markdown for an agent that asked for it.
tags: [agents, static]
---

# The same notes, read by machines

This site is prerendered with `output: 'static'`, and the build writes two files per note: the HTML a browser renders, and the markdown an agent gets by appending `.md` to the URL. Both come from the same entry, so they cannot drift.

## What the build emits

<figure class="callout">

`/notes/agent-readable-content` → the page. `/notes/agent-readable-content.md` → the same content, unstyled. `/llms.txt` → the index of every published note.

</figure>

Raw HTML like that `<figure>` is content, not markup to be interpreted: a `.md` file is markdown, so the block is passed through as written.

## Braces are prose here too

A markdown body can talk about code without escaping it. Writing `{ title, date, tags }` in a sentence produces exactly those characters, because `.md` is compiled as markdown rather than as MDX. The other extension opts into the other reading, by name.

## The index is derived, not maintained

`llms.txt` and the sitemap both come from the routes the app enumerates, and the note route enumerates the collection:

```ts
export const staticParams = () => publishedNotes().map((note) => ({ slug: note.id }));
```

Publish a note and it appears in the navigation, the prerender, the sitemap and the agent index at once. Mark it `draft: true` and it disappears from all four — there is one list, and everything reads it.
