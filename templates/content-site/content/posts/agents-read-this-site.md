---
title: Agents read this site natively
date: 2026-07-28
summary: No scraping, no guessing — llms.txt, markdown projections and a typed search tool.
tags: [agentic-web]
---

An agent landing on this site does not have to parse HTML and hope. It has three
doors, all cheaper and all exact.

## llms.txt

`GET /llms.txt` lists every published page with its description, and every tool
with its guard. It is generated from the routes and the manifest, so it cannot go
stale.

## Markdown projections

Append `.md` to any page URL and you get the page back as clean markdown — the
original source, not a rendering of a rendering.

## A typed search tool

`api.site.search` takes `{ q }` and returns matching posts with their URLs and
markdown projections. The search box in the header calls exactly the same tool.
