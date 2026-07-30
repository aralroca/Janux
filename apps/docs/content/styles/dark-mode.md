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

When you need an explicit toggle, the pattern is to keep the media query as the *default* and let an attribute win over it:

```css
:root {
  --bg: #f8fafc;
  --fg: #0f172a;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #020617;
    --fg: #f8fafc;
  }
}

:root[data-theme='dark'] {
  --bg: #020617;
  --fg: #f8fafc;
}
```

Three states, in order of precedence: an explicit `data-theme`, then the OS preference, then light. Reading it back is `document.documentElement.dataset.theme`.

The flash comes back the moment the attribute is applied *after* first paint. Two ways to avoid that:

- **Set it during SSR** when the choice is something the server knows — a cookie, a user profile — so the attribute is in the HTML from the first byte.
- **Set it in a blocking inline script** in the shell when the choice lives in `localStorage`, so it lands before the browser paints.

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
