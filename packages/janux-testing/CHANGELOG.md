# @janux/testing

## 0.7.0

### Minor Changes

- Testing, at the application level: the new `@janux/testing` package adds a route harness (`createTestApp` — a page through its real `_layout` chain, middleware and `ctx`, in-process), `api()` mocking at the invocation boundary (`mockApi`/`resetApiMocks`, with guards and schemas still enforced), and Playwright fixtures whose `goto` waits for `janux.settled()` instead of a sleep. `janux test` runs an app's suite with `bun test`.
