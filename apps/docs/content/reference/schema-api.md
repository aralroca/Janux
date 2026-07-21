# Schema API

Everything typed in Janux uses one schema system, importable from `janux`.

## Builders

| Builder | JSON Schema projection | Zero value |
|---|---|---|
| `str()` | `{ type: 'string' }` | `''` |
| `int()` | `{ type: 'integer' }` | `0` |
| `num()` | `{ type: 'number' }` | `0` |
| `bool()` | `{ type: 'boolean' }` | `false` |
| `money()` | `{ type: 'integer', format: 'money-minor-units' }` | `0` |
| `enums(['a','b'])` | `{ enum: ['a','b'] }` | first value |
| `list(shapeOrType)` | `{ type: 'array', items }` | `[]` |
| `obj({...})` / `schema({...})` | `{ type: 'object', properties, required }` | recursive |

`list({ id: str() })` is shorthand for `list(obj({ id: str() }))`.

## Modifiers

Chainable, immutable — each returns a new type:

```ts
str().nullable()          // null allowed; JSON Schema type becomes ['string','null']
int().optional()          // may be missing
int().default(1)          // applied when missing; also removes it from `required`
int().min(1).max(99)      // value bounds (length bounds for strings)
```

## validate(type, value)

```ts
const result = validate(cartSchema, input);
// { ok: boolean, value: unknown, errors: [{ path, message }] }
```

- Missing value: `.default()` wins → `optional` passes `undefined` → `nullable` passes `null` → `required` error.
- Unknown object keys are **stripped**, never passed through.
- Error paths are precise: `items[0].qty: below min 1`.

The framework calls this for you on every intent input, api input/output and event payload. You call it directly only for custom validation flows.

## buildDefault(type)

Builds initial state: explicit defaults, `null` for nullables, `[]` for lists, first enum value, zero values for primitives. This is how a component boots when no `initial` is provided.

## toJsonSchema(type)

Serializes to standard JSON Schema — what the manifest publishes for every tool input and resource schema, so external MCP clients and LLMs validate against the same contract the server enforces.

> **Note:** state must stay plain JSON. Class instances, functions or DOM nodes in state are rejected — that single constraint powers serialization, resume, diffing and the agent surface.
