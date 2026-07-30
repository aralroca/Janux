# Dark mode

Dark mode in a server-rendered app has one hard requirement: the page must arrive already correct. Anything that decides the theme in JavaScript after load produces a flash of the wrong colours.

The way to avoid that is to let CSS decide, and to keep JavaScript for the case where the reader wants to *override* the system.

## Follow the system, for free

```css
/* src/styles.css */
:root {
  color-scheme: light dark;
  --bg: #f8fafc;
  --fg: #0f172a;
  --muted: #64748b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #020617;
    --fg: #f8fafc;
    --muted: #94a3b8;
  }
}

body {
  background: var(--bg);
  color: var(--fg);
}
```

Two things are doing work here:

- **`color-scheme: light dark`** tells the browser the page handles both, so form controls, scrollbars and the default canvas follow along instead of staying stubbornly light.
- **The media query** flips the [custom properties](/docs/styles/css-variables), not the rules. Every rule keeps reading `var(--bg)` and never learns which mode it is in.

This costs no JavaScript, has no flash, and works on a page that ships [0 KB of JS](/docs/guide/ssr-and-resumability).

## Letting the reader override it

When you need an explicit toggle, the pattern is to keep the media query as the *default* and let an attribute win over it. **Put that attribute on `<body>`** — the next section explains why it cannot go on `<html>`:

```css
:root {
  color-scheme: light dark;
}

body {
  --bg: #f8fafc;
  --fg: #0f172a;
  background: var(--bg);
  color: var(--fg);
}

@media (prefers-color-scheme: dark) {
  body:not([data-theme='light']) {
    --bg: #020617;
    --fg: #f8fafc;
  }
}

body[data-theme='dark'] {
  --bg: #020617;
  --fg: #f8fafc;
  color-scheme: dark;
}

body[data-theme='light'] {
  color-scheme: light;
}
```

Three states, in order of precedence: an explicit `data-theme`, then the OS preference, then light.

```ts
document.body.dataset.theme = 'dark';   // explicit
delete document.body.dataset.theme;     // back to following the system
```

## Why the attribute belongs on `<body>`

This is the one Janux-specific rule on the page, and getting it wrong produces a bug that only shows up on the *second* page you visit.

SPA navigation diffs the incoming document against the live one with [`diff-dom-streaming`](https://github.com/brisa-build/diff-dom-streaming), which holds a deliberate [strong opinion on BODY tag attributes during diffing](https://github.com/brisa-build/diff-dom-streaming#strong-opinion-on-body-tag-attributes-during-diffing): **attributes on `<body>` are never overwritten by the diff.** Every other element — `<html>` included — has its attributes updated to match the server's response.

The reasoning is that `<body>` is where runtime presentation state lives. Themes, fonts and density are chosen in the browser, so the server's copy of that attribute is always the stale one; preserving it is what keeps a choice alive across navigations.

The consequence for a theme toggle is concrete:

| Where you set it | After an SPA navigation |
|---|---|
| `document.body.dataset.theme` | **Survives** — the diff leaves body attributes alone. |
| `document.documentElement.dataset.theme` | **Lost** — `<html>` is diffed, so the server's markup wins and the reader's choice is silently reset. |

So `body[data-theme]`, not `:root[data-theme]`. The same applies to a class (`document.body.classList`) and to any other `data-*` attribute you use to carry display state — density, reduced motion, a brand skin. This documentation site's own toggle works exactly this way.

## Avoiding the flash on a full load

A full page load is a different matter: nothing is being diffed, so the attribute has to be re-applied from wherever you persisted it — and the flash comes back the moment that happens *after* first paint. Two ways to avoid it:

- **Set it during SSR** when the choice is something the server knows — a cookie, a user profile — so `<body data-theme="dark">` is in the HTML from the first byte.
- **Set it in a blocking inline script** in the shell when the choice lives in `localStorage`, so it lands before the browser paints.

Note that the two mechanisms cover different journeys and you generally want both: SSR or the inline script handles the first load, and the body-attribute rule above is what carries the choice through every navigation after it.

## Testing both modes

`prefers-color-scheme` is emulable, so both themes are assertable rather than eyeballed:

```ts
await page.emulateMedia({ colorScheme: 'dark' });

expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(2, 6, 23)');
```

Asserting the computed colour rather than the presence of a class is what catches the real failure — a variable that was declared but never actually read.

## Images and borders

Two details that are easy to miss, and both are visible immediately in dark mode:

```css
img { background: #fff; }             /* transparent PNGs stop vanishing */
.card { border-color: color-mix(in srgb, var(--fg) 12%, transparent); }
```

A border that is a fixed light grey reads as a bright line on a dark canvas. Deriving it from the foreground keeps its contrast constant in both modes.
