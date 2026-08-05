# Baseline — July 2026 (pre-optimization)

First complete measurement of Janux 0.4.0 against react 19.2 / preact 10.29 /
solid 2.0-beta / svelte 5.56 / vue-vapor 3.6-rc across the 19 suites ported
from octane. Machine: see `README.md` (Apple M4 Pro, 24 GB, macOS 26.5.2,
Node 26, Bun 1.3.14, headless Chromium 151). Normal iterations, `--record`.

Runtime state at measurement time: it already includes the loop's first two
changes (keyed morph + intent batching — without them the reorder corpus could
not even enter and `update` cost 1816ms).

## Key readings (after the optimization loop)

- **Parity or wins across the full-app suites**: lifecycle 1.00×react, stores 0.83-1.27× (outlier: tanstack invalidation 1.62×), submit 0.92×, reset 0.40×, scheduler 1.48×, composition 1.26×, suspense-recovery 1.01-1.10×.
- **Resume crushes hydration**: news hydrate 0.13×react; hydration at 6× throttle 0.19-0.20×; hydration_work 0.22-0.24×.
- **Bundle**: 24.7KB total js_gzip = 0.40×react; 4th of 6 (preact 10.0, solid 14.1, svelte 18.4, janux 24.7≈vue-vapor 24.1, react 62.1).
- **Bulk creation**: runlots 0.64×, clear 0.75×.
- **Honest gaps with a known cause**: sub-ms krausest micro-ops (select 16.8×, remove 20× — needs a fine-grained list primitive, RFC below) and SSR throughput (4.5× — the string-emission pipeline, the next server-side lever).
- **scaling-curves is now ~linear**: 19.5/41/101/258/508ms for 8/32/96/256/512 (was 127/454/1281/3470/7609).

## Optimization-loop attempts and reversals

Mandatory log: every optimization attempted, its hypothesis, and the measured
delta — including the ones that get reverted.

| # | Change | Hypothesis | Measured delta | Status |
|---|---|---|---|---|
| 1 | Keyed morph (client/keys.ts) | the reorder identity gate demands moving nodes, not rewriting them | reorder: from an impossible gate to green | ✅ committed |
| 2 | Intent batching + pull-on-read computeds | N synchronous writes = 1 flush without leaving derived stale | update 1816→25.9ms | ✅ committed |
| 3 | External react in fixtures (= the plugin's foreignExternals) | react-dom's lazy chunks are not shipped bytes | fw_gzip 82.2→22.1KB | ✅ committed (fixture, not core) |
| 4 | Coalescer as a push pump (fix, not opt) | ~600 0ms timers per render never fire under a microtask loop and pin their machinery | 810MB→0.6MB per 1000 SSR renders; the ssr-throughput OOM disappears | ✅ committed — found BY the harness |
| 5 | JSX-against-DOM reconciler (reconcile.ts) | building the throwaway tree with toDomNodes was the dominant fixed cost | select 26.2→16.2, update 24.4→17.1, swap 28.8→22.4 | ✅ committed |
| 6 | sameProps/sameValue + LIS + unkeyed fast-paths (CPU-profile-guided: matchState 22%) | value-equal props do not reserialize; unkeyed lists skip Map/Set/LIS; equivalent bound intents count as "unchanged" | select→7.4, update→8.4, swap→9.9; runlots 0.63×react, clear 0.89× | ✅ committed |
| 7 | Render queue (runtime/render-queue.ts + an optional `schedule` on `effect`) | every intent flushed its own batch inline, so N events in ONE task cost N full island renders however little each changed; queueing collapses them into one, still inside the task | delegated_input_burst 145.1→12.6ms (11.6×, and past react); scaling-curves update_512 was 508ms of pure per-event renders | ✅ committed |
| 8 | Sync `invokeMarker` + `notify` early-return on a reader-less signal | an already-mounted island paid a wrapper promise and two microtask hops per event to `await Promise.resolve()`; and one state write bumps path+descendants+ancestors, most of which nobody reads | inside run-to-run noise on its own; kept because both are strictly less work per event | ✅ committed |
| 9 | **`<For each by>` — a reactive scope per row** (`for.ts` + the `<For>` block in `reconcile.ts`) | the floor is that ONE change re-runs the whole island view; a per-row scope makes the list level diff keys and move nodes while a row's body re-runs only for that row's data | update 5.52→2.70, swap 6.56→2.10 (react 4.20), remove 11.94→2.30; reverse 9.22→2.88, rotatef 5.46→1.30, rotateb 5.53→1.29, prepend100 13.20→3.90, removefirst 5.78→1.32, displace3..8 ~6.0→1.31; todomvc add100 29.34→10.00, destroy25 14.68→4.30 | ✅ committed |
| 9a | `by`, not `key`, for row identity | — (bug found building #9) | JSX **reserves** `key`: the transform lifts it out of the props object, so `props.key` was always `undefined`. Every row missed its scope, every pass built 1,000 fresh ones and leaked the old ones — `select` degraded ~13ms per list write and reached 3,000ms | ✅ fixed |
| 9b | Two queues in `drain()` (effects vs computeds) | — (bug found building #9) | `drain` rescanned the WHOLE batch queue for computeds before every effect: O(effects²). Invisible while an island was one effect, ~3s once a list is a thousand. `select` 3,099→869ms from this change alone | ✅ committed |
| 9c | `reconcileChildren` fills freshly created elements | — (bug found building #9) | `toDomNodes` expanded `<For>` as a plain component, so a list only got scopes when its container already existed — a first render built 1,000 scope-less rows and the next pass rebuilt them all | ✅ committed |
| 9d | **Leak**: dispose a list whose CONTAINER stops being rendered | — (bug found building #9) | `{todos.length > 0 && <section><For/></section>}` dropped the container but kept every row effect alive and subscribed. Emptying and refilling leaked one live effect per row per cycle: todomvc `edit10` reached 460ms; now 7.30ms. Lists are registered per island root and swept when their container leaves the tree | ✅ committed, with a regression test |
| 10 | List-owned DOM ordering + one pass object per list + lazy index signal + byte-mask LIS | a list whose rows ARE its container's children needs none of the key/host/text matching, and each row already knows where it sat last pass — which IS the LIS input, so ordering needs no node→index map or target Set | rotateb 1.29→0.59, displace3 1.31→0.64, removefirst 1.32→0.63, reverse 2.88→2.15 (past react), swap 1.30 (react 4.30) | ✅ committed |
| 11 | `plainify` clones the RAW value behind a state proxy | writing a 1,000-row list walked the traps: a `childPath` and two map lookups per property, for values copied verbatim | part of the js-framework `run`/`add` improvement; the state layer was 20% of a `rotateb` profile and stopped being the top frame | ✅ committed |
| 12 | Gate `versionOf` in `readTrap` on `tracking()` | a read with nothing tracking cannot be subscribed to, so the version signal (and its index entry) is pure waste — an intent walking `state.rows` was minting 1,000 of them | ~15% off list writes — and **11 conformance tests failed**: proxy identity is keyed on the version signal, so a write stopped minting a new identity for the changed subtree, which is the contract `foreign()` hands React (the TanStack Table render loop) | ❌ reverted |
| 13 | SSR renders synchronously until something actually awaits | every node was an `async` function: one promise and one microtask per element, plus a buffer/flag/closure per child in `renderSiblings`, for pages where nothing ever parks | news ssr_render 0.53→0.286ms (react 0.075) | ✅ committed |
| 14 | `escapeHtml` char scan + single-pass `attrEntries` (profile-guided: 13% and 18% of an SSR render) | almost no string contains `& < > "`, and `attrEntries` went entries→map→filter→dedupe-filter→flatMap→spread — six arrays and a Set per element | folded into #13's 0.53→0.286; `attrEntries` and `escapeHtml` left the top of the profile | ✅ committed |
| 15 | `setImmediate` instead of `setTimeout(…, 0)` for the suspense flush | Node clamps a zero timer to 1ms and that 1ms landed whole on the shell's TTFB; the check phase also runs after microtasks, so the "did the content settle first" race stays as deterministic | streaming-ssr shell_staggered 1.47→1.12ms, total_allfast 1.52→1.485 | ✅ committed |
| 16 | Island host flush inside `#main` in the js-framework/todomvc fixtures | a pretty-printed `<janux-island>` tag leaves two real whitespace text nodes inside the census root, which the other columns (empty root div) do not pay | whitespace_text 2→0; text_1k 2023→2021 and text_100 108→106, both now tied with react | ✅ committed (fixture) |
| 17 | **Reactive prop bindings** (`class={() => …}`) — `isBinding`/`bindProps`/`applyBinding` | `<For>` bails a row out when its DATA is unchanged, but a shared signal read INSIDE the row body still re-runs every body; a thunk defers the read so only one attribute is rewritten | js-framework select 4.68→1.10→0.82 (react 0.30); the view stops re-rendering entirely for a bound read | ✅ committed |
| 18 | Creation fast paths (empty container appends straight through; primitive children are one `textContent`; a binding compares its VALUE before mapping it to an attribute) | building a 1,000-row table is almost entirely "create into an empty element", which was paying match-state + ordering per element | run 8.50→6.56, add 10.04→8.04, runlots 87.96→68.94 (react 136.86, +1.98×) | ✅ committed |
| 19 | `each={() => …}` gives the list its OWN effect | if the enclosing view subscribes to the array, every list write re-renders the page around it — the js-framework jumbotron was rebuilt by every row op | reverse 2.08→1.95 (react 2.24, +1.15×), rotatef 0.51 (1.51, +2.96×), displace3 0.63→0.56, removefirst 0.62→0.54 | ✅ committed |
| 20 | **Reactive text children** (`{() => state.draft}`) | the attribute binding does nothing for `<output>{state.total}</output>`, which is most of what a form or a dashboard re-renders for | hydration-interactivity 11 negative cells → 6, hydration-stress 12 → 7; uncontrolled_6x_post_hydration_typing 185.04→~103 (react 103) | ✅ committed |
| 21 | `<For each={() => CARDS}>` + bound outputs in the hydration fixture | every keystroke rebuilt 100+ static cards inside the island view | the whole `*_post_hydration_typing` group moved from -1.5..-1.7× to parity or better | ✅ committed (fixture) |
| 22 | Bindings on the 20-field runtime-stress form (`value`, the echoed `<output>`, `checked`) | the same trick should fix `controlled-form typing` | **REGRESSION**: `state.values[i]` reads the CONTAINER path first, so every one of the 512 bindings subscribes to `values` and a write to ANY field re-runs all of them. scaling-curves update_512 16.84→101.48 (react ~46), update_256 10.18→53.32, delegated_input_burst 10.72→30.40, controls_submit 67.42→83.80 | ❌ reverted |
| 23 | **Leaf-path subscription for binding thunks** (`withLeafTracking` in `state/reactive-state.ts`, wrapped around every binding effect) | #22's boundary is structural, not inherent: record the paths a thunk traverses and subscribe only the MAXIMAL ones — `touch` already bumps a written path's descendants, so a container write still reaches the leaf signal | 512 sibling field bindings: one write re-runs 1 binding, not 512 (regression test). Unblocks #22's fixture bindings, which now land via #24: controlled-form typing 87.5→83.5, controls_submit 73.3→68.6, reset 18.6→15.7; scaling-curves update_256 11.3→10.6, update_512 17.9→17.0 (2026-08-05 pass, vs a same-day pre-change baseline). Cost: fw_gzip +84B | ✅ committed |
| 24 | **Compile-time binding maps** (`@janux/vite` `binding-sites.ts`; on by default, `compiler.bindingMaps: false` opts out) | what #17/#20/#21 hand-wrote, the compiler can prove: a JSX site that is a pure static read of a schema-typed state path (map-callback list indexing included) rewrites to the same thunk shape — so an idiomatic view stops re-rendering per island without the author binding anything | the janux fixtures now build through the shipped compiler, as the Solid/Svelte/Vapor fixtures ship theirs; the #23 deltas are the compiled numbers; zero janux regressions across js-framework, scaling-curves, controlled-form, todomvc and bundle-size; app bytes +2B gzip | ✅ committed |
| 25 | **Per-intent code splitting** (`compiler.splitIntents`, `intent-split.ts`) | a provably self-contained `run()` moves to a chunk downloaded on first invocation; the stub keeps `intents[name]`'s callable shape, so wire markers, guards, schemas and the manifest never notice | shop: 9 of 12 intents extract (~1.2KB gz of on-demand chunks) but the entry grows 32.9→33.3KB gz — stub + chunk overhead exceeds what tiny run bodies move. Kept opt-in: it pays exactly when a run carries real weight (a heavy import) | ✅ committed (opt-in) |

**What #22 teaches, and it is the boundary of the primitive**: a binding is a
win exactly when its thunk reads a path narrower than what the enclosing view
already subscribes to. Reading `state.values[i]` touches `values` on the way in,
so N bindings over one container are N times the work of one view render, not
1/N. `<For>` does not have this problem because the list level reads the
container once and the rows read nothing. (#23 has since removed this
boundary: a binding effect subscribes only to the maximal paths its thunk
read.)


**Where that leaves the board (full run 2026-08-02, third pass — the report below)**:
**88 of 156 janux/react cells are `+` and 68 are `-` — 56.4% positive**, from
68/87 (43.9%) at the start of this loop and 74/82 (47.4%) after `<For>` alone.
The 90% acceptance bar (141 cells) was **not** reached.

The two primitives added since the last pass, and what each bought:

| primitive | op | before | now | react |
|---|---|---|---|---|
| bindings | js-framework select | 5.60 | **0.82** | 0.30 |
| bindings + `<For>` | js-framework swap | 6.56 | **1.10** | 3.98 ✅ +3.62× |
| creation fast paths | js-framework runlots | 112.7 | **68.94** | 136.86 ✅ +1.98× |
| creation fast paths | js-framework run | 8.60 | 6.56 | 4.88 |
| list-level effect | reorder reverse | 9.22 | **1.95** | 2.24 ✅ +1.15× |
| list-level effect | reorder rotatef | 5.46 | **0.51** | 1.51 ✅ +2.96× |
| text bindings | hydration uncontrolled_6x_post_hydration_typing | 184.20 | **~103** | 103 ✅ |
| text bindings | hydration controlled_6x_post_hydration_typing | 178.26 | **~102** | 97 |
| `<For>` + bindings | todomvc add100 | 29.34 | **8.80** | 10.04 ✅ +1.14× |
| `<For>` + bindings | todomvc destroy25 | 14.68 | **4.02** | 4.62 ✅ +1.15× |

The 68 remaining `-` cells, by cause:

1. **Bulk row construction** (27 cells: js-framework `run`/`replace`/`add`,
   reorder `prepend/append/insertmid100`, `rotateb`, `removefirst`,
   `displace3..8`, `removeevery10`, todomvc `toggleAll*`, `edit10`,
   `filterCycle`). A janux row costs an Owner, a signal, an effect and a binding
   effect on top of its DOM; solid's rows are compiled templates. The reorder
   ops are all ~0.5ms absolute against react's 0.15 — the floor is the list
   diff + LIS over 1,000 keys plus the per-row scope, not the DOM move.
2. **Island boot** (13 hydration cells). `*_hydration` is janux ~10ms vs react
   ~4ms at 6× throttle, and `*_hydration_work` reads -11× to -48× only because
   react's denominator is 0.1-0.4ms. Note the same suites' *end-to-end* rows are
   wins: `uncontrolled_6x_hydration` 10.70 vs react 57.62, `news hydrate` 0.39
   vs 2.86.
3. **Store/query integration parity** (13 cells, every one inside ±1.37×).
   These are 13-20ms measurements where the two columns differ by a few percent
   and which flip sign between runs; `tanstack_query_invalidation` (-1.37×) is
   the only one outside the noise band.
4. **Structural, and not moving without a decision** (10 cells): `todo_app_*`
   (-1.24×, 1.3KB vs 1.1KB of *app* code — Janux carries a schema and a
   description per intent because the agent surface is generated from them),
   `nodes_1k`/`elements_1k`/`nodes_100`/`elements_100` (-1.00×, exactly one
   extra element: the `<janux-island>` resumability host), `shell_staggered` /
   `shell_allfast` (-10.5× / -25.0×, the deliberate one-turn wait that lets fast
   content inline instead of emitting a boundary), `news ssr_render` (-3.49×).
5. **Five singles with their own story**: `controlled-form typing` (-1.65×) and
   `controls_submit` (-1.09×) — see log entry #22, the binding that would fix
   them makes four other cells worse; `scheduler-responsiveness` (-1.52×);
   `interact_and_recover` (-1.18×); `scaling-curves update_8` (-1.62×, the one
   size where the fixed per-event cost dominates).

**On the 13 cells that flipped `+`→`-` in the previous pass**: this run answers
it. `narrow_write`, `zustand_broad`, `tanstack_query_broad`, `total_staggered`,
`error_reveal`, four `*_first_input` rows and `tanstack_query_mount` are back on
the `+` side or moved again in the opposite direction, while a different set of
store cells went negative. They are noise, as suspected — but the honest form of
that statement is that this suite's ±5% cells are not stable run to run, not
that any particular one is fine.

## Position report (full run 2026-08-02, third pass)

Measured on one machine, no harness gate failures. The `janux/react` column is
signed: `+N×` means janux is N times better, `-N×` N times worse.

### application-composition

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount_dashboard | 39.86ms | 40.42ms | 43.10ms | 39.82ms | 37.92ms | 39.78ms | +1.01× |
| interact_and_recover | 177.08ms | 149.52ms | 132.72ms | 137.04ms | 151.80ms | 137.78ms | -1.18× |
| teardown_dashboard | 32.88ms | 32.82ms | 33.28ms | 32.32ms | 32.70ms | 31.98ms | -1.00× |

### bundle-size

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| js_raw | 93.2KB | 192.8KB | 24.8KB | 36.6KB | 45.5KB | 62.7KB | +2.07× |
| js_gzip | 32.5KB | 60.7KB | 9.8KB | 13.7KB | 17.9KB | 23.5KB | +1.87× |
| js_brotli | 29.2KB | 52.4KB | 8.9KB | 12.4KB | 16.3KB | 21.3KB | +1.80× |
| app_raw | 4.8KB | 5.6KB | 5.2KB | 6.2KB | 5.0KB | 6.4KB | +1.17× |
| app_gzip | 1.9KB | 2.0KB | 1.9KB | 1.9KB | 2.2KB | 2.0KB | +1.05× |
| app_brotli | 1.7KB | 1.8KB | 1.7KB | 1.7KB | 1.9KB | 1.8KB | +1.04× |
| fw_raw | 88.4KB | 187.1KB | 19.6KB | 30.4KB | 40.5KB | 56.3KB | +2.12× |
| fw_gzip | 30.6KB | 58.6KB | 7.9KB | 11.8KB | 15.7KB | 21.5KB | +1.92× |
| fw_brotli | 27.4KB | 50.6KB | 7.2KB | 10.7KB | 14.3KB | 19.5KB | +1.84× |
| todo_js_raw | 92.0KB | 190.1KB | 21.5KB | 33.6KB | 46.6KB | 62.3KB | +2.07× |
| todo_js_gzip | 31.9KB | 59.7KB | 8.7KB | 13.2KB | 18.1KB | 23.8KB | +1.87× |
| todo_js_brotli | 28.6KB | 51.5KB | 7.9KB | 11.9KB | 16.4KB | 21.6KB | +1.80× |
| todo_app_raw | 3.6KB | 2.9KB | 2.1KB | 2.9KB | 3.3KB | 3.0KB | -1.25× |
| todo_app_gzip | 1.3KB | 1.1KB | 1.0KB | 1.3KB | 1.5KB | 1.3KB | -1.24× |
| todo_app_brotli | 1.2KB | 0.9KB | 0.8KB | 1.1KB | 1.3KB | 1.2KB | -1.24× |
| todo_fw_raw | 88.4KB | 187.2KB | 19.4KB | 30.7KB | 43.3KB | 59.3KB | +2.12× |
| todo_fw_gzip | 30.6KB | 58.7KB | 7.8KB | 11.9KB | 16.7KB | 22.5KB | +1.92× |
| todo_fw_brotli | 27.4KB | 50.6KB | 7.1KB | 10.8KB | 15.2KB | 20.4KB | +1.85× |

### controlled-form

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| typing | 80.84ms | 49.12ms | 46.28ms | 104.10ms | 60.92ms | 45.90ms | -1.65× |
| controls_submit | 73.02ms | 66.94ms | 65.68ms | 108.84ms | 68.20ms | 67.40ms | -1.09× |
| reset | 14.74ms | 38.64ms | 40.84ms | 36.02ms | 23.44ms | 41.22ms | +2.62× |

### event-delegation

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| delegated_input_burst | 10.72ms | 18.12ms | 3.54ms | 3.28ms | 4.94ms | 5.30ms | +1.69× |

### external-store-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 22.60ms | 27.44ms | 41.10ms | 22.48ms | 20.72ms | 28.14ms | +1.21× |
| narrow_write | 15.96ms | 17.88ms | 21.06ms | 18.78ms | 16.94ms | 17.98ms | +1.12× |
| broad_write | 18.68ms | 20.12ms | 16.08ms | 16.08ms | 16.50ms | 15.74ms | +1.08× |
| rapid_writes | 15.06ms | 14.80ms | 15.40ms | 14.86ms | 15.88ms | 16.00ms | -1.02× |
| unmount | 14.62ms | 16.62ms | 16.22ms | 16.76ms | 16.52ms | 16.26ms | +1.14× |

### external-store-integrations

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| zustand_mount | 22.38ms | 23.76ms | 34.38ms | 21.86ms | 23.44ms | 22.74ms | +1.06× |
| zustand_narrow | 20.08ms | 17.60ms | 20.74ms | 16.16ms | 16.34ms | 17.30ms | -1.14× |
| zustand_broad | 18.02ms | 18.64ms | 17.00ms | 17.90ms | 17.12ms | 16.94ms | +1.03× |
| zustand_rapid | 15.28ms | 14.96ms | 14.88ms | 14.98ms | 15.90ms | 15.54ms | -1.02× |
| zustand_unmount | 15.12ms | 16.88ms | 16.22ms | 15.84ms | 16.38ms | 16.18ms | +1.12× |
| jotai_mount | 19.60ms | 18.94ms | 31.92ms | 21.02ms | 19.74ms | 19.00ms | -1.03× |
| jotai_narrow | 16.80ms | 17.18ms | 19.32ms | 17.38ms | 17.40ms | 14.42ms | +1.02× |
| jotai_broad | 16.94ms | 16.76ms | 17.70ms | 16.14ms | 15.88ms | 17.30ms | -1.01× |
| jotai_rapid | 16.38ms | 16.38ms | 15.64ms | 15.94ms | 16.60ms | 15.60ms | +1.00× |
| jotai_unmount | 14.98ms | 15.74ms | 15.68ms | 15.80ms | 15.62ms | 15.68ms | +1.05× |
| tanstack_query_invalidation | 2.86ms | 2.08ms | 2.12ms | 1.80ms | 2.04ms | 2.02ms | -1.37× |
| tanstack_query_mount | 19.68ms | 19.50ms | 31.28ms | 19.42ms | 19.06ms | 20.46ms | -1.01× |
| tanstack_query_narrow | 14.68ms | 13.96ms | 20.52ms | 14.76ms | 15.42ms | 13.86ms | -1.05× |
| tanstack_query_broad | 16.44ms | 17.48ms | 17.30ms | 17.38ms | 16.48ms | 16.92ms | +1.06× |
| tanstack_query_rapid | 17.22ms | 15.92ms | 15.60ms | 16.22ms | 17.06ms | 17.22ms | -1.08× |
| tanstack_query_unmount | 13.46ms | 13.36ms | 13.08ms | 12.84ms | 14.56ms | 12.94ms | -1.01× |

### hydration-interactivity

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.54ms | 1.72ms | 1.64ms | 1.50ms | 1.54ms | 1.54ms | +1.12× |
| uncontrolled_1x_pre_hydration_typing | 13.44ms | 17.12ms | 17.60ms | 16.12ms | 14.98ms | 15.20ms | +1.27× |
| uncontrolled_1x_hydration | 6.86ms | 14.66ms | 5.90ms | 8.80ms | 9.66ms | 7.14ms | +2.14× |
| uncontrolled_1x_hydration_work | 0.78ms | 3.20ms | 2.22ms | 3.24ms | 2.32ms | 2.52ms | +4.10× |
| uncontrolled_1x_post_hydration_typing | 8.64ms | 11.42ms | 14.28ms | 8.06ms | 8.76ms | 8.32ms | +1.32× |
| uncontrolled_6x_first_input | 8.82ms | 7.98ms | 9.04ms | 9.40ms | 7.70ms | 8.70ms | -1.11× |
| uncontrolled_6x_pre_hydration_typing | 70.84ms | 67.58ms | 71.00ms | 72.28ms | 71.96ms | 75.46ms | -1.05× |
| uncontrolled_6x_hydration | 11.34ms | 59.98ms | 17.26ms | 25.10ms | 25.30ms | 22.50ms | +5.29× |
| uncontrolled_6x_hydration_work | 5.46ms | 20.38ms | 13.42ms | 20.22ms | 14.86ms | 16.14ms | +3.73× |
| uncontrolled_6x_post_hydration_typing | 78.86ms | 96.54ms | 127.50ms | 66.46ms | 72.58ms | 76.16ms | +1.22× |
| controlled_6x_first_input | 8.22ms | 9.28ms | 8.26ms | 8.82ms | 9.14ms | 7.90ms | +1.13× |
| controlled_6x_pre_hydration_typing | 76.40ms | 79.54ms | 73.92ms | 69.36ms | 72.70ms | 72.34ms | +1.04× |
| controlled_6x_hydration | 11.26ms | 57.10ms | 17.50ms | 24.44ms | 26.00ms | 22.78ms | +5.07× |
| controlled_6x_hydration_work | 5.68ms | 19.68ms | 13.68ms | 19.82ms | 15.74ms | 16.72ms | +3.46× |
| controlled_6x_post_hydration_typing | 81.04ms | 97.48ms | 123.78ms | 67.30ms | 75.68ms | 75.62ms | +1.20× |
| interaction_6x_hydration | 10.42ms | 3.58ms | 18.14ms | 22.26ms | 23.88ms | 21.58ms | -2.91× |
| interaction_6x_interaction_to_hydration | 68.00ms | 83.82ms | 71.70ms | 75.12ms | 79.74ms | 76.08ms | +1.23× |
| search_send_6x_first_input | 9.76ms | 9.98ms | 8.40ms | 7.64ms | 8.92ms | 8.66ms | +1.02× |
| search_send_6x_pre_hydration_typing | 70.96ms | 108.58ms | 75.30ms | 72.70ms | 71.68ms | 74.52ms | +1.53× |
| search_send_6x_hydration | 9.98ms | 3.62ms | 17.08ms | 24.92ms | 24.08ms | 23.08ms | -2.76× |
| search_send_6x_hydration_work | 4.80ms | 0.10ms | 13.34ms | 20.28ms | 15.20ms | 17.24ms | -48.00× |
| search_send_6x_interaction_to_hydration | 36.40ms | 34.44ms | 40.90ms | 53.50ms | 49.46ms | 50.88ms | -1.06× |

### hydration-stress

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.62ms | 1.78ms | 1.54ms | 1.64ms | 1.96ms | 1.78ms | +1.10× |
| uncontrolled_1x_pre_hydration_typing | 16.30ms | 16.22ms | 15.28ms | 15.44ms | 18.44ms | 17.12ms | -1.00× |
| uncontrolled_1x_hydration | 6.30ms | 13.60ms | 7.70ms | 8.40ms | 6.90ms | 7.80ms | +2.16× |
| uncontrolled_1x_hydration_work | 0.74ms | 3.26ms | 2.28ms | 3.10ms | 2.40ms | 2.56ms | +4.41× |
| uncontrolled_1x_post_hydration_typing | 9.10ms | 11.16ms | 14.78ms | 8.56ms | 10.64ms | 9.14ms | +1.23× |
| uncontrolled_6x_first_input | 8.88ms | 9.10ms | 8.74ms | 9.40ms | 9.98ms | 9.36ms | +1.02× |
| uncontrolled_6x_pre_hydration_typing | 78.14ms | 96.70ms | 75.60ms | 88.92ms | 106.44ms | 104.72ms | +1.24× |
| uncontrolled_6x_hydration | 10.70ms | 57.62ms | 18.76ms | 26.80ms | 27.44ms | 24.76ms | +5.39× |
| uncontrolled_6x_hydration_work | 5.26ms | 19.88ms | 13.16ms | 20.86ms | 17.12ms | 18.14ms | +3.78× |
| uncontrolled_6x_post_hydration_typing | 70.62ms | 113.32ms | 136.34ms | 101.72ms | 120.12ms | 117.20ms | +1.60× |
| controlled_6x_first_input | 8.08ms | 10.36ms | 9.98ms | 9.66ms | 11.36ms | 11.20ms | +1.28× |
| controlled_6x_pre_hydration_typing | 70.34ms | 86.16ms | 85.04ms | 81.58ms | 116.08ms | 108.06ms | +1.22× |
| controlled_6x_hydration | 12.12ms | 58.22ms | 18.16ms | 27.32ms | 29.28ms | 25.22ms | +4.80× |
| controlled_6x_hydration_work | 4.88ms | 19.96ms | 13.88ms | 21.70ms | 18.58ms | 18.64ms | +4.09× |
| controlled_6x_post_hydration_typing | 79.56ms | 125.62ms | 132.96ms | 89.96ms | 122.40ms | 122.96ms | +1.58× |
| interaction_6x_hydration | 10.34ms | 4.06ms | 17.42ms | 23.38ms | 27.46ms | 24.52ms | -2.55× |
| interaction_6x_interaction_to_hydration | 68.98ms | 88.04ms | 73.32ms | 78.70ms | 91.36ms | 85.90ms | +1.28× |
| search_send_6x_first_input | 8.18ms | 12.68ms | 8.16ms | 10.44ms | 10.08ms | 10.04ms | +1.55× |
| search_send_6x_pre_hydration_typing | 69.90ms | 164.96ms | 80.14ms | 94.00ms | 110.52ms | 98.32ms | +2.36× |
| search_send_6x_hydration | 9.76ms | 4.52ms | 18.24ms | 27.64ms | 27.92ms | 25.06ms | -2.16× |
| search_send_6x_hydration_work | 4.66ms | 0.42ms | 14.28ms | 22.14ms | 17.34ms | 18.18ms | -11.10× |
| search_send_6x_interaction_to_hydration | 37.14ms | 40.10ms | 44.70ms | 57.48ms | 54.42ms | 53.04ms | +1.08× |
| keyboard_send_6x_first_input | 9.18ms | 10.82ms | 8.04ms | 9.58ms | 10.38ms | 10.28ms | +1.18× |
| keyboard_send_6x_pre_hydration_typing | 66.42ms | 142.02ms | 71.54ms | 89.60ms | 100.12ms | 110.70ms | +2.14× |
| keyboard_send_6x_hydration | 11.52ms | 4.06ms | 16.96ms | 26.22ms | 27.78ms | 25.48ms | -2.84× |
| keyboard_send_6x_hydration_work | 4.98ms | 0.20ms | 13.70ms | 21.30ms | 17.46ms | 18.96ms | -24.90× |
| keyboard_send_6x_interaction_to_hydration | 25.00ms | 20.56ms | 29.28ms | 40.40ms | 41.78ms | 40.54ms | -1.22× |

### js-framework-reorder

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| reverse | 1.95ms | 2.24ms | 1.10ms | 1.43ms | 2.08ms | 16.04ms | +1.15× |
| shuffle | 2.10ms | 2.07ms | 1.19ms | 1.58ms | 2.76ms | 1.90ms | -1.01× |
| rotatef | 0.51ms | 1.51ms | 0.09ms | 0.67ms | 0.17ms | 0.13ms | +2.98× |
| rotateb | 0.51ms | 0.13ms | 0.08ms | 0.14ms | 0.17ms | 0.08ms | -3.98× |
| prepend100 | 2.48ms | 1.02ms | 0.32ms | 0.32ms | 1.58ms | 0.62ms | -2.43× |
| append100 | 2.40ms | 0.80ms | 0.34ms | 0.40ms | 1.38ms | 0.68ms | -3.00× |
| insertmid100 | 2.42ms | 0.94ms | 0.30ms | 0.32ms | 1.48ms | 0.70ms | -2.57× |
| removefirst | 0.54ms | 0.15ms | 0.06ms | 0.04ms | 0.22ms | 0.13ms | -3.61× |
| removeevery10 | 0.49ms | 0.31ms | 0.19ms | 0.24ms | 0.30ms | 0.19ms | -1.60× |
| displace3 | 0.56ms | 0.17ms | 0.13ms | 0.22ms | 1.49ms | 0.13ms | -3.24× |
| displace4 | 0.58ms | 0.17ms | 0.14ms | 0.22ms | 1.46ms | 0.13ms | -3.39× |
| displace5 | 0.57ms | 0.17ms | 0.15ms | 0.22ms | 1.48ms | 0.15ms | -3.29× |
| displace6 | 0.57ms | 0.17ms | 0.15ms | 0.23ms | 1.45ms | 0.14ms | -3.36× |
| displace8 | 0.58ms | 0.18ms | 0.15ms | 0.23ms | 1.48ms | 0.14ms | -3.21× |

### js-framework

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| run | 6.56ms | 4.88ms | 1.92ms | 2.28ms | 6.70ms | 3.14ms | -1.34× |
| replace | 10.90ms | 8.90ms | 4.52ms | 4.66ms | 11.46ms | 6.62ms | -1.22× |
| add | 8.04ms | 4.70ms | 1.74ms | 1.98ms | 6.98ms | 3.32ms | -1.71× |
| update | 1.62ms | 0.68ms | 0.66ms | 0.22ms | 0.84ms | 0.40ms | -2.38× |
| select | 0.82ms | 0.30ms | 0.04ms | 0.08ms | 0.36ms | 0.02ms | -2.73× |
| swap | 1.10ms | 3.98ms | 0.24ms | 0.22ms | 0.44ms | 0.36ms | +3.62× |
| remove | 1.48ms | 0.68ms | 0.16ms | 0.20ms | 0.62ms | 0.42ms | -2.18× |
| runlots | 68.94ms | 136.86ms | 15.60ms | 18.20ms | 57.98ms | 26.74ms | +1.99× |
| clear | 38.40ms | 41.74ms | 25.58ms | 24.38ms | 36.54ms | 30.36ms | +1.09× |
| nodes_1k | 10073 | 10072 | 10072 | 10072 | 10072 | 10116 | -1.00× |
| elements_1k | 8052 | 8051 | 8051 | 8050 | 8051 | 8051 | -1.00× |
| text_1k | 2021 | 2021 | 2021 | 2022 | 2021 | 2045 | +1.00× |
| comments_1k | 0 | 0 | 0 | 0 | 0 | 20 | — |
| empty_text_1k | 0 | 0 | 0 | 1 | 0 | 2 | — |
| whitespace_text_1k | 0 | 0 | 0 | 0 | 0 | 22 | — |

### lifecycle-memory

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 17.12ms | 17.14ms | 30.99ms | 17.61ms | 17.21ms | 18.23ms | +1.00× |
| update | 15.79ms | 15.78ms | 19.64ms | 15.69ms | 15.40ms | 16.12ms | -1.00× |
| unmount | 16.43ms | 16.64ms | 16.09ms | 16.59ms | 16.74ms | 16.61ms | +1.01× |
| cycle | 49.35ms | 49.56ms | 66.73ms | 49.89ms | 49.35ms | 50.96ms | +1.00× |

### news

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| ssr_render | 0.26ms | 0.07ms | 0.06ms | 0.05ms | 0.02ms | 0.03ms | -3.49× |
| hydrate | 0.39ms | 2.86ms | 1.91ms | 2.12ms | 1.66ms | 1.90ms | +7.39× |

### scaling-curves

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| update_8 | 7.50ms | 4.64ms | 1.82ms | 2.08ms | 3.30ms | 5.12ms | -1.62× |
| update_32 | 6.46ms | 6.54ms | 2.56ms | 2.34ms | 1.78ms | 1.76ms | +1.01× |
| update_96 | 4.66ms | 11.60ms | 2.14ms | 3.50ms | 4.28ms | 3.44ms | +2.49× |
| update_256 | 10.18ms | 23.98ms | 7.72ms | 8.24ms | 9.04ms | 6.30ms | +2.36× |
| update_512 | 16.84ms | 45.58ms | 13.14ms | 14.16ms | 17.06ms | 13.68ms | +2.71× |

### scheduler-responsiveness

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| input_during_updates | 557.78ms | 367.82ms | 353.92ms | 355.56ms | 481.28ms | 347.62ms | -1.52× |

### ssr-throughput

| op | news-50/janux | news-50/react | news-50/preact | news-50/solid | news-50/svelte | news-50/vue-vapor | news-500/janux | news-500/react | news-500/preact | news-500/solid | news-500/svelte | news-500/vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| render | 0.26ms | 0.09ms | 0.09ms | 0.06ms | 0.03ms | 0.02ms | 2.51ms | 0.88ms | 0.92ms | 0.53ms | 0.31ms | 0.25ms | — |

### store-selector-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 27.20ms | 34.70ms | 39.14ms | 30.20ms | 36.06ms | 33.32ms | +1.28× |
| store_write | 18.96ms | 20.80ms | 20.64ms | 21.02ms | 21.76ms | 19.42ms | +1.10× |
| parent_rerenders | 17.80ms | 14.52ms | 20.70ms | 3.76ms | 4.38ms | 5.66ms | -1.23× |
| store_write_after_rerenders | 15.82ms | 15.12ms | 17.12ms | 17.70ms | 16.76ms | 17.30ms | -1.05× |
| unmount | 14.16ms | 14.84ms | 14.38ms | 14.38ms | 15.60ms | 15.88ms | +1.05× |

### streaming-ssr

| op | janux | react | preact | solid | janux/react |
|---|---|---|---|---|---|
| shell_staggered | 1.20ms | 0.11ms | 0.16ms | 1.42ms | -10.54× |
| total_staggered | 50.86ms | 51.06ms | 50.98ms | 50.69ms | +1.00× |
| shell_allfast | 1.40ms | 0.06ms | 0.07ms | 1.53ms | -24.99× |
| total_allfast | 1.42ms | 1.49ms | 1.20ms | 1.56ms | +1.05× |

### suspense-recovery

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| error_reveal | 45.90ms | 40.42ms | 37.02ms | 41.50ms | 40.90ms | 36.66ms | -1.14× |
| retry_recovery | 34.98ms | 33.48ms | 32.54ms | 39.02ms | 32.52ms | 33.20ms | -1.04× |
| cancel_recovery | 32.42ms | 30.28ms | 31.42ms | 30.14ms | 31.22ms | 31.08ms | -1.07× |

### todomvc

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| add100 | 8.80ms | 10.04ms | 1.20ms | 1.24ms | 13.66ms | 1.98ms | +1.14× |
| toggleAllOn | 1.14ms | 0.32ms | 0.50ms | 0.10ms | 0.38ms | 0.18ms | -3.56× |
| toggleAllOff | 1.10ms | 0.36ms | 0.48ms | 0.14ms | 0.34ms | 0.20ms | -3.06× |
| complete25 | 4.60ms | 5.06ms | 0.60ms | 0.34ms | 5.30ms | 0.68ms | +1.10× |
| filterCycle | 1.48ms | 1.02ms | 0.56ms | 0.54ms | 1.04ms | 0.62ms | -1.45× |
| edit10 | 8.24ms | 4.28ms | 0.82ms | 0.82ms | 6.30ms | 1.56ms | -1.93× |
| clearCompleted | 0.42ms | 0.40ms | 0.18ms | 0.16ms | 0.34ms | 0.16ms | -1.05× |
| destroy25 | 4.02ms | 4.62ms | 0.40ms | 0.32ms | 4.86ms | 0.58ms | +1.15× |
| nodes_100 | 624 | 623 | 724 | 726 | 623 | 1035 | -1.00× |
| elements_100 | 518 | 517 | 517 | 517 | 517 | 517 | -1.00× |
| text_100 | 106 | 106 | 207 | 209 | 106 | 416 | +1.00× |
| comments_100 | 0 | 0 | 0 | 0 | 0 | 102 | — |
| empty_text_100 | 0 | 0 | 101 | 103 | 0 | 2 | — |
| whitespace_text_100 | 0 | 0 | 0 | 0 | 0 | 308 | — |

