# i18n API

The runtime behind [internationalization](/docs/guide/i18n). Configure `src/i18n.ts` and the framework calls these for you; import them when you need translation outside a component or you're building tooling.

```ts
import { getI18n, translateCore, selectMessages, formatElements } from 'janux';
```

## getI18n(ctx)

`getI18n<T>(ctx: { i18n?: unknown }): I18n<T>` — pulls the request's i18n handle (locale, `t`, locales list) off a context bag:

```ts
run: ({ ctx }) => {
  const { t, locale } = getI18n(ctx);

  return { message: t('cart.emptied'), locale };
},
```

It **throws** when i18n isn't configured, with the fix in the message (`add src/i18n.ts with an I18nConfig default export`) — a missing setup fails loudly at the call site instead of silently returning untranslated keys.

## translateCore(locale, config)

`translateCore(locale: string, config: I18nConfig): Translate` builds the `t` function for one locale. This is what powers `t()` in components, and what you call directly on the server (a webhook, an email, a PDF) where there's no request context:

```ts
const t = translateCore('es', i18nConfig);

t('cart.total', { count: 3 });
```

Behavior worth knowing:

- **Plurals via `Intl.PluralRules`** for the locale — `zero`/`one`/`two`/`few`/`many`/`other` where the language has them, not a hand-rolled `count === 1`.
- **Interpolation recurses** through arrays and objects, so a message tree (a nested dictionary of strings) interpolates in one call.
- **`allowEmptyStrings`** defaults to `true`: an empty translation stays empty rather than falling back to the key, which is what you want for deliberately blank strings.

## selectMessages(dic, used, declared?, separator?)

`selectMessages(dic, used, declared = [], separator = '.')` returns the **subset** of a dictionary a page actually needs:

```ts
selectMessages(messages, ['cart.total', 'cart.empty'], [/^checkout\./]);
```

- `used` — the keys the page's render touched (the framework collects these while rendering).
- `declared` — extra keys or **RegExp patterns** to include for messages resolved dynamically at runtime, which a render-time collector can't see.
- `separator` — key nesting separator.

This is why a Janux page ships only its own translations instead of every locale string in the app: the client bundle gets the selected subset. If a dynamic message shows up as a raw key in the browser, adding its pattern to `declared` is the fix.

## formatElements(value, elements?)

`formatElements(value: string, elements)` turns inline tags in a translation into real nodes, so translators can move markup around without touching code:

```ts
// messages: { terms: 'Read the <0>terms</0> before <1>continuing</1>' }
formatElements(t('terms'), [<a href="/terms" />, <strong />]);
```

Elements are passed **by index** (an array) or **by name** (an object keyed by tag). A string with no tags is returned unchanged, so it's safe to wrap every translation. Newlines inside the value are stripped before parsing, which keeps multi-line YAML/JSON messages predictable.

Related: [Internationalization (i18n)](/docs/guide/i18n) · [`examples/i18n`](https://github.com/aralroca/Janux/tree/main/examples/i18n)
