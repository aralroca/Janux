/**
 * Pages whose examples are compile-checked but not yet EXECUTED.
 *
 * Compiling a snippet proves it parses and imports real symbols; only running
 * it proves the behavior the prose claims. (A draft of recipes/forms.md said
 * `int()` coerces the "42" a form submits — it compiles, imports fine, and is
 * false. The executable test caught it.)
 *
 * It is currently EMPTY: every page that imports the framework in a snippet has
 * a test in `pages/` that runs it. `page-coverage.test.ts` fails when a new page
 * with runnable examples appears in neither place, so adding one here is a
 * deliberate, visible regression rather than an oversight.
 */
export const UNTESTED_PAGES: string[] = [];
