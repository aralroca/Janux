---
title: Writing in markdown with a typed header
date: 2026-07-20
summary: Frontmatter is validated by schema() — a bad date or a missing title fails the build, not the reader.
tags: [content]
---

Every post starts with a header like this one. It is not convention — it is a
contract, checked by the same schema system that validates an intent's input.

## The contract

`title`, `date` and `summary` are required strings; `tags` defaults to an empty
list; `draft` defaults to `false`. Break the contract and the site tells you at
build time, with the file name and the field.

## Drafts

Set `draft: true` and the post disappears from the index, the search, the llms.txt
and the sitemap — but stays in your repository, ready to publish by deleting one
line.
