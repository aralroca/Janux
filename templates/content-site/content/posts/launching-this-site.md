---
title: Launching this site
date: 2026-08-01
summary: Why this site ships with two faces — pages for people, projections for agents.
tags: [launch]
---

Welcome. This site is markdown files in `content/posts/`, rendered by Janux with
frontmatter validated by the same `schema()` that types application state.

## Two faces from day one

Every page you can read here is also available to machines, without scraping:

- `/llms.txt` indexes every page and every tool.
- Any page is clean markdown at its own URL plus `.md`.
- The search box on the home page and the `api.site.search` tool are **the same
  code** — what a visitor types and what an agent calls cannot drift apart.

## What to do next

Replace these posts with your own writing, keep the frontmatter contract, and the
index, the feed of projections and the search stay correct by construction.
