---
title: Frontmatter the framework validates
date: 2026-07-04
summary: "One schema() checks a post's metadata and a component's state. There is no second validator to keep in step."
tags: [schema, collections]
---

# Frontmatter the framework validates

Every file in `content/notes/` opens with a frontmatter block, and every block is checked against the collection's schema before a page is built. A note missing its `title`, or writing `date: soon` where a string was promised, fails the build with the file name and the field — it does not ship a page whose `<title>` reads `undefined`.

## One schema, two surfaces

The schema is the same one components use for state and intents use for input:

```ts
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

Nothing above is content-specific. `str()`, `list()` and `bool()` are the builders that describe an island's state, and `validate()` — the function that runs on every intent call — is what checks this file's header. Content and state are validated by one implementation, not by two that agree until they don't.

## Reading it back

`entry.data` is typed from the schema, so the page reads fields rather than guessing at them:

```tsx
import { getCollection } from '@janux/content';
import { notes } from '../content';

export default function Index() {
  return (
    <ul>
      {getCollection(notes, (note) => !note.data.draft).map((note) => (
        <li key={note.id}>
          <a href={`/notes/${note.id}`}>{note.data.title}</a>
        </li>
      ))}
    </ul>
  );
}
```

`note.data.title` is a `string` because the schema said so. Rename the field and the page stops compiling, which is the point: the metadata contract is checked at the same moment as the rest of the app.

## Defaults are real values

`tags` defaults to `[]` and `draft` to `false`, so a note that declares neither still reads as a note with no tags that is published. Defaults are validated like anything else — a default the schema itself would reject is an error, not a value that quietly enters the page.
