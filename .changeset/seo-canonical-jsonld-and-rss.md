---
'janux': minor
'@janux/server': minor
'@janux/vite': patch
'@janux/cli': patch
---

Per-route metadata is typed the rest of the way, and a content site can finally publish a feed. `og`/`twitter`
become `OpenGraphMeta`/`TwitterMeta` and `robots` accepts a `RobotsMeta` object serialized in one stable order, so
the values a page declares are checked rather than spelled. CamelCase aliases name the properties a literal key
cannot — `siteName` → `og:site_name`, `imageAlt` → `og:image:alt`, and `publishedTime`/`modifiedTime` →
`article:published_time`/`article:modified_time`, which escape the `og:` prefix entirely because they belong to
another vocabulary. Every previous spelling still type-checks and emits identical bytes, ids included: an id keeps
only the first `:`, so nothing the SPA head diff matches on moved.

`articleJsonLd`, `breadcrumbJsonLd` and `organizationJsonLd` build the structured data a content site needs —
typed input in, schema.org naming out, absent fields dropped so a block never carries `"description":undefined`.
The results stay open, so a page spreads what the input does not carry on top: `{ ...articleJsonLd(x), isPartOf }`.

A `feed` config publishes the site's content at `GET /rss.xml`, the same idea as `llms.txt` and the per-page
markdown projection, for human readers. The router knows pages, not titles or dates, so the app maps its own
content layer into `items()` — usually a collection, newest first — and the response is memoized like `llms.txt`
because that call typically reads every content file off disk. It is doubly opt-in (`siteUrl` and `feed`), every
page advertises it with a keyed `rel="alternate"` link emitted only where the feed will actually resolve, and
`output: "static"` writes it beside the pages through the same hook that writes the sitemap — so a static host
serves it with no server at all.

One detail worth stating, because it is invisible until a validator says so: an author's name is emitted as
`dc:creator`, not `<author>`. RSS reserves that element for an email address, and a feed carrying a name there is
rejected outright.
