---
"janux": minor
---

Boot features are imports now, so unused layers ship zero bytes.

`boot({ glow: true, cursor: true })` forced every app to bundle the glow painter, the simulated cursor, the i18n installer and the query-payload hydration — used or not; that always-on wiring had grown the krausest fixture's shipped JS from 24.7KB to 34.8KB gzip, past the 0.5×react ratio guard. The optional layers are now code the app imports, not flags the runtime resolves:

```ts
import { boot, agentGlow, agentCursor, i18n } from 'janux/client';

boot({ defs: [App], glow: agentGlow(), cursor: agentCursor(), i18n: i18n() });
```

- `glow` / `cursor` take `agentGlow(options?)` / `agentCursor(options?)` instead of `boolean | options`. Passing `true` is a type error, and dev builds warn at runtime.
- New `i18n: i18n()` boot feature reads the page's embedded dictionary and re-reads it after every SPA navigation. Apps without translations no longer ship `translate-core`. Apps WITH translations must add it — this was previously unconditional.
- Query-payload hydration moved out of `boot()` into the first browser `getQueryClient()` (the payload sink on `window.__JANUX_QUERY__` queues chunks until then, so nothing is lost and SSR data is still never refetched). Apps with no queries no longer ship the query cache.
- The always-on WebMCP surface keeps its visual primitives through the new `janux/client` seam module (`emitToolTarget`, `suspendAgentGlow`, `glowElement`, `injectGlowStyles`, `GLOW_CLASS`) — `enableAgentGlow`/`enableAgentCursor` remain exported for manual wiring, and `BootFeature` is the contract a custom feature implements.
- The package now declares `"sideEffects": false`: importing any `janux` module has never had an observable global effect, and saying so lets bundlers drop re-exported-but-unused modules (the SSR unsuspense runtime among them) from client builds.

Measured on the krausest bundle fixture: 34,818 → 30,937 bytes total js gzip (react: 62,120) — back under the `js_gzip ≤ 0.5×react` and `fw_gzip ≤ 0.5×react` guards.
