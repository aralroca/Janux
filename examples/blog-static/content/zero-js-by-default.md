---
title: Zero JavaScript by default
date: 2026-07-10
description: No client entry means no runtime, no hydration and no script tags — the pages are just HTML.
---

## No client entry, no bundle

This app has no `src/client.ts`, so there is nothing to bundle: `janux build` prints **fully static app (0 KB JS)** and the pages ship without a single script of JavaScript.

## The browser still gets ahead

Without a client runtime every navigation is a real document load, which is exactly what the [Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API) is for. Janux emits the rules script on every page, so hovering a link on the index prefetches the post before the click.

## When you outgrow this

Add `src/client.ts` with `boot()` and islands resume on interaction — the static pages stay static.
