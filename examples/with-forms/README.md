# Validated forms

A conference registration form where ONE typed `schema()` — `str()` with bounds, `int()`, `num()`, `bool()`, `enums()` — is the single contract for the form UI, the `api()` endpoint and the agent tool.

- **One schema, three surfaces** — `registrationInput` in `src/schema.ts` is the form intent's input, the api's server-side validation and the tool's JSON Schema in the manifest. Nothing to keep in sync, and no string-typed twin for the form.
- **`coerce: 'form'`** — FormData only ever submits strings, so the intent declares `coerce: 'form'`: `'3'` becomes `3`, a checked `newsletter` box becomes `true` and an absent one `false` — before the usual validation. An agent calling the same intent sends real JSON and it passes through untouched. The rules live in the [forms recipe](https://janux.build/docs/recipes/forms).
- **Attributes for humans, schema for correctness** — `required`, `minLength`, `min`/`max` mirror the schema for native browser feedback; a submit that bypasses them (or a hand-crafted invalid `POST /_janux/api/registrations.register`) still gets the schema's verdict.
- **Persistence via `api()`** — the valid submit delegates to the typed api, which stores the registration in memory and answers a receipt (`id`, `spot`).
- **Agent parity** — the manifest announces the SAME typed input schema for `registration.submit` and `api.registrations.register`: the agent sees `integer`, the form sends `"3"`, both work.

> `money()` is deliberately **not scaled** by `coerce: 'form'` — it stays minor units. A euros text field feeding `money()` still needs your own `×100`; this example keeps the donation a plain `num()` in euros instead.

```bash
bun install
bun run dev   # http://localhost:4321
```

The coercion-then-validation the intent runs is `coerceForm()` + `validate()` from `janux`:

```ts
import { coerceForm, validate } from 'janux';
import { registrationInput } from './src/schema';

const input = coerceForm({ name: 'A', attendees: '0', donation: '5', track: 'ai' }, registrationInput);
const checked = validate(registrationInput, input);

// checked.ok === false
// checked.errors: [{ path: 'name', message: 'below min 2' }, { path: 'attendees', message: 'below min 1' }]
```

## Where things live

| File | What it shows |
|---|---|
| `src/schema.ts` | The shared typed contract: `str().min(2).max(60)`, `int().min(1).max(8)`, `num().min(0)`, `bool().default(false)`, `enums(TRACKS)` |
| `src/server/registrations.api.ts` | The `api()` pair: `register` (validated persist + receipt) and `listRegistrations` |
| `src/components/Registration.tsx` | The form island: `coerce: 'form'` on the typed input, schema-mirroring HTML attributes |
| `src/routes/index.tsx` | The page mounting the island |
