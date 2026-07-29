# Validated forms

A conference registration form where one `schema()` — `str()` with bounds, `int()`, `money()`, `enums()` — is the single contract for the form UI, the `api()` endpoint and the agent tool.

- **One schema, three surfaces** — `registrationInput` in `src/schema.ts` validates the api input server-side, is published as the tool's JSON Schema in the manifest, and runs client-side for per-field errors. Nothing to keep in sync.
- **FormData never coerces** — every control submits a string, so the form intent declares strings (`attendees: str()`), converts in `run` (`'3'` → `3`, euros → cents) and validates the typed candidate with `validate()`. The [forms recipe](https://janux.build/docs/recipes/forms)'s "two names, one behavior" pattern.
- **Per-field errors, no reload** — a failed `validate()` writes `{ path, message }` pairs into state; the view paints each next to its field. A hand-crafted invalid `POST /_janux/api/registrations.register` gets the same schema's verdict as a structured `400`.
- **Persistence via `api()`** — the valid submit delegates to the typed api, which stores the registration in memory and answers a receipt (`id`, `spot`).
- **Agent parity** — the manifest exposes both faces: `registration.submit` (what the form sends — strings) and `api.registrations.register` (the typed contract — real integers, cents, the enum). The agent registers exactly what a human submits.

```bash
bun install
bun run dev   # http://localhost:4321
```

The conversion-then-validation the form intent runs is plain `validate()` from `janux`:

```ts
import { validate } from 'janux';
import { registrationInput } from './src/schema';

const checked = validate(registrationInput, { name: 'A', attendees: 0, donation: 1250, track: 'ai' });

// checked.ok === false
// checked.errors: [{ path: 'name', message: 'below min 2' }, { path: 'attendees', message: 'below min 1' }]
```

## Where things live

| File | What it shows |
|---|---|
| `src/schema.ts` | The shared typed contract: `str().min(2).max(60)`, `int().min(1).max(8)`, `money().min(0)`, `enums(TRACKS)` |
| `src/server/registrations.api.ts` | The `api()` pair: `register` (validated persist + receipt) and `listRegistrations` |
| `src/components/Registration.tsx` | The form island: string-typed intent input, `toCandidate()` conversion, per-field error state |
| `src/routes/index.tsx` | The page mounting the island |
