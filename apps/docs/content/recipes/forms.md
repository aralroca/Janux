# Forms

A form is one intent. Put `onSubmit={...}` on the `<form>` and the submitted fields become the intent's input — validated against its schema, guarded like any other action, and callable by an agent without a form at all.

```tsx
export const Signup = component({
  name: 'signup',
  description: 'Newsletter signup',
  state: schema({ status: enums(['idle', 'sent', 'failed']).default('idle') }),
  intents: {
    submit: intent({
      description: 'Subscribe an email address',
      input: schema({ email: str().min(3), plan: enums(['free', 'pro']) }),
      run: async ({ state, input }) => {
        state.status = (await subscribe(input)) ? 'sent' : 'failed';
      },
    }),
  },
  view: ({ state, intents }) => (
    <form onSubmit={intents.submit}>
      <input name="email" type="email" required />
      <select name="plan">
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </select>
      <button type="submit">Subscribe</button>
      {state.status === 'sent' ? <p>Check your inbox.</p> : null}
    </form>
  ),
});
```

## How the input is built

On submit, Janux calls `new FormData(form)` and turns the entries into the intent's input object. Consequences worth knowing:

- **`name` is what matters.** A control without a `name` is not submitted — no `name`, no field, and the intent's schema validation will tell you so.
- **Everything arrives as a string** (or a `File`) — and schema types **do not coerce** by default. `int()` rejects `"42"`, `bool()` rejects `"on"`. Declare `coerce: 'form'` on the intent when its input comes from a form — see the pattern below.
- **The default submit is prevented** for you — no full page reload, no `event.preventDefault()` to remember.
- **Unchecked checkboxes are absent**, not `false`. With `coerce: 'form'` absence means `false`; without it, model them as `bool().default(false)` so the default fills the gap.
- **Same-named controls collapse** to the last value (`FormData.entries()` semantics). For multi-select, read the values in `run` from your own state instead.

### Numbers and checkboxes: `coerce: 'form'`

Keep ONE typed schema and declare that the intent is fed by a form. Before validation, string values are converted to what the schema means; everything else is the usual pipeline:

```tsx
intents: {
  submit: intent({
    description: 'Subscribe an email address',
    input: schema({ email: str().min(3), age: int().min(18), optIn: bool().default(false) }),
    coerce: 'form',
    run: ({ state, input }) => {
      state.age = input.age;      // "42" arrived, 42 validated
      state.optIn = input.optIn;  // checkbox: 'on' → true, absent → false
    },
  }),
},
```

The rules, per schema type:

- `int()` / `num()` / `money()` — parsed with `Number`. A blank or non-numeric field stays invalid (`""` never becomes `0`), and `money()` is **never scaled**: it remains minor units, so a euros text field still needs your own `×100` (keep `str()` and convert in `run` for that one field, or collect minor units).
- `bool()` — checkbox semantics: `'on'`/`'true'` mean checked, an absent field means `false`.
- `str()` / `enums()` — untouched.

Coercion only pre-processes strings: input that is already typed passes through as-is, so **the same intent accepts an agent's JSON** and the manifest keeps announcing the typed schema — the agent sees `integer`, the form sends `"3"`, both work. Without `coerce`, nothing changes: strings are rejected as ever.

## Validation is the schema, not the markup

HTML attributes (`required`, `type="email"`, `min`) give the browser its native UX. The **contract** is the intent's `input` schema — that's what runs on the server, what an agent sees as JSON Schema, and what rejects a hand-crafted request. Keep both: the attributes for humans, the schema for correctness.

A failed validation throws a `JanuxIntentError` before `run` executes, so `run` only ever sees well-typed input.

## The agent gets the form for free

Because the form is an intent, the copilot can subscribe someone without touching the DOM:

```
signup.submit { "email": "ada@example.com", "plan": "pro" }
```

Same validation, same guard, same audit entry. If that shouldn't happen unattended, declare `guard: 'confirm'` and the agent's call returns a proposal a human approves ([intents and guards](/docs/guide/intents-and-guards)).

## Live feedback while typing

Add `reset` to the `<form>` when the fields should clear on submit — a chat box, an "add another" form. The runtime calls the platform's `form.reset()` after capturing the values, so each control goes back to its rendered `value`; leave the field uncontrolled (no `value` prop) and that is empty. Doing it from state doesn't work: a controlled write is skipped while the control has focus, and Enter keeps it there.

`intent={...}` fires on submit. For per-keystroke behavior (availability checks, character counters) bind `onInput` to a separate intent — it's debounced by the delegated event surface and IME-safe:

```tsx
<input name="handle" onInput={intents.checkHandle} value={state.handle} />
```

See [events and interactions](/docs/guide/events-and-interactions) for controlled inputs, and [views and JSX](/docs/guide/views-and-jsx) for the full event table.

## Uploads

File inputs work the same way — the entry is a `File`. For drag-and-drop, paste and progress, use [`dropzone`](/docs/reference/client-state) with an [HTTP handler](/docs/guide/http-handlers) endpoint: `zone.upload(url, files)` POSTs each file as multipart and reports per-file progress through the `onProgress` callback, while the handler bounds the body with `formDataWithin` and validates real content with `matchesType` (magic bytes, not the declared MIME type).

Related: [Intents and guards](/docs/guide/intents-and-guards) · [Views and JSX](/docs/guide/views-and-jsx) · [Schema types](/docs/reference/schema-api)
