---
title: Hello, Janux
date: 2026-07-01
description: Starting a blog where the markdown files are the database and the build is the deploy.
---

## Files as the source of truth

This blog has no CMS and no database: every post is a markdown file in `content/`, parsed at render time on the server. Adding a post is adding a file.

## What a post can use

The parser covers a deliberately small markdown subset:

- Headings, paragraphs and lists
- **Bold**, `inline code` and [links](https://github.com/aralroca/Janux)
- Fenced code blocks

```ts
const posts = readdirSync('content').filter((file) => file.endsWith('.md'));
```

That is enough for prose, and small enough to read in one sitting.
