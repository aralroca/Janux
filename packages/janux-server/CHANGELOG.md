# @janux/server

## 0.5.0

### Minor Changes

- The HTML shell splits around pending suspense boundaries.
- The invocation pipeline carries the caller's origin, for both intents and `api()`.
- MCP specification 2026-07-28, served alongside the previous era.

### Patch Changes

- `tools/list` serves JSON Schema instead of the internal `JxType`.
- Native enter/leave semantics, bubble-phase suppression and capture-phase delegation for rich events.
- `approve`/`reject` refuse agent callers; approved runs keep the agent origin in the audit trail.

## 0.4.0

### Minor Changes

- Pages stream: the prelude flushes before the render and the epilogue after it.
- Serves the prefetch and speculation configuration.
