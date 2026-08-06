# @janux/node

## 0.7.0

### Patch Changes

- `redirects` and `rewrites` in `janux.config.ts` — the URL map a migrating product arrives with, kept inside the framework.

  Until now a product with a history had to leave the router to answer its old URLs: a custom server or a reverse proxy, which is routing in a place neither the manifest nor `janux verify` can see. Both are declared now, in **the file router's own segment grammar** — `[param]`, `[param=matcher]`, `[...rest]`, `[[...rest]]`, the app's own matchers included — parsed by the same `parsePattern` (now exported from `@janux/server`) and matched by the same code the route tree uses. Two pattern languages in one framework is a design bug, so there is one.

  ```ts
  export default defineConfig({
    redirects: [
      { from: "/kb/[slug]", to: "/wiki/[slug]" },
      { from: "/plans", to: "/pricing", status: 301 },
    ],
    rewrites: [{ from: "/handbook/[...path]", to: "/docs/[...path]" }],
  });
  ```

  A redirect answers with a status (default **308**, the one that may not turn a POST into a GET) and a `Location` carrying whatever the pattern captured, plus the query the visitor arrived with. A rewrite serves another route and tells the browser nothing.

  **Precedence is written down and tested:** `src/middleware.ts` → redirects → rewrites → the i18n locale redirect → the route. A legacy URL is therefore answered as itself rather than bounced to its localized form first, so the map is written once and not once per locale. Rules resolve in declaration order, first match wins.

  **A rewrite cannot become a way around a guard.** `/_janux/*` is unreachable from one: a literal destination fails at boot, and one assembled from the URL at request time is refused rather than throwing, so a hostile path cannot turn a rule into a 500. Declared rules never apply to a request already addressed to `/_janux/*` either, so a greedy `[...all]` is a migration map and not a decision to take the agent surface off the air. Chains settle in at most 8 hops and a cycle raises an error naming it; a redirect pointing at its own source is refused where it is written, because no hop limit can catch a loop that runs in the browser.

  An app declaring neither pays nothing: the rules compile to `undefined` and the request never calls in.

  **Adapters.** `AdapterCapabilities` gains `redirects` — whether the target can express the rules in its own routing config, which is the only way they exist under `output: 'static'`. `@janux/vercel` declares `true` and compiles them into the Build Output routing table ahead of the filesystem handler; `janux build` reports the gap for a target that cannot, and says so on its own too. Third-party adapters must add the flag.

## 0.6.0

### Minor Changes

- Released with the rest of the workspace.

  `PUBLISH_ORDER` publishes ten packages and `scripts/version.ts` requires the
  ten to agree on one version, but the `fixed` group in `.changeset/config.json`
  still named the eight that existed when it was written — so nothing bumped
  these two along and the release refused to cut. Both are in the group now,
  and every package added from here has to join it.
