---
title: Agent-readable pages
date: 2026-07-20
description: The same posts humans read are served to agents as llms.txt, a sitemap and per-page markdown projections.
---

## Three machine-readable views

A Janux server projects this blog for agents without extra code:

- `/llms.txt` — an index of every concrete page, expanded through `staticParams`
- `/sitemap.xml` — absolute URLs for crawlers, derived from `siteUrl`
- `/posts/<slug>.md` — any page back as clean markdown, straight from the SSR HTML

## Why it matters

An agent asked about this blog never scrapes the HTML: it reads `llms.txt`, picks a page and fetches the `.md` projection — the same content, **one representation per audience**.
