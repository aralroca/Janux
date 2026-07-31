---
title: Not ready yet
date: 2026-07-08
summary: The newest file in the collection, and it appears nowhere — draft is a schema field, so hiding it is a filter.
tags: [collections]
draft: true
---

# Not ready yet

This note is the most recent file in `content/notes/`, which is exactly why it is here: if drafts leaked, this would be the first thing on the index.

It is absent from the listing, from `staticParams`, from `llms.txt` and from the prerendered output, because one filter — `(note) => !note.data.draft` — feeds all of them.
