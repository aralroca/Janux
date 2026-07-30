---
title: Schema types
description: One small schema system types everything in Janux — component state, intent inputs, api() contracts and events — and validates all of them the same way.
---

# Schema types

Everything typed in Janux — component state, intent inputs, api() contracts, events — uses one small schema system from `janux`:

```ts
import { schema, str, int, num, bool, money, enums, list, obj } from 'janux';

const cart = schema({
  items: list({ productId: str(), qty: int().min(1), unitPrice: money() }),
  coupon: str().nullable(),
  status: enums(['open', 'paid']).default('open'),
  meta: obj({ note: str() }).optional(),
});
```

## Builders

| Builder | Meaning |
|---|---|
| `str()` | string |
| `int()` | integer |
| `num()` | finite number |
| `bool()` | boolean |
| `money()` | integer amount in minor units (cents); marked `format: money-minor-units` in JSON Schema |
| `enums([...])` | one of a closed set |
| `list(shapeOrType)` | array; `list({...})` is shorthand for `list(obj({...}))` |
| `obj({...})` / `schema({...})` | object with a fixed shape |

## Modifiers

Chainable and immutable: `.optional()`, `.nullable()`, `.default(value)`, `.min(n)`, `.max(n)` (length for strings, value for numbers).

## Validation semantics

- Missing value: explicit `.default()` wins → `optional` passes `undefined` → `nullable` passes `null` → otherwise `required` error.
- Unknown object keys are **stripped**, never passed through.
- Errors carry precise paths: `items[0].qty: below min 1`.

## Defaults

`buildDefault(type)` produces initial state: explicit defaults, `null` for nullables, `[]` for lists, first value for enums, zero values for primitives (`''`, `0`, `false`). This is how a component boots with no `initial` prop.

## JSON Schema projection

`toJsonSchema(type)` serializes any Janux type to standard JSON Schema — this is what the manifest publishes for every tool input and resource, so MCP clients and LLMs validate against the same contract your server enforces.
