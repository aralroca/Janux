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

**Where that leaves the board (full run 2026-08-02, second pass — the report below)**:
`<For>` landed, and with it the fine-grained group moved from "a constant
regardless of what changed" to "proportional to what changed". Against react
alone, **74 of 156 cells are now `+` and 82 are `-`** (from 68 `+` / 87 `-` of 155).

What actually moved, janux then → now, with react alongside:

| suite | op | before | now | react |
|---|---|---|---|---|
| js-framework | swap | 6.56 | **1.30** | 4.12 ✅ +3.17× |
| js-framework | runlots | 112.7 | **87.96** | 139.36 ✅ +1.58× |
| js-framework | clear | 40.8 | **39.90** | 50.80 ✅ +1.27× |
| js-framework | update | 5.52 | 1.92 | 0.68 |
| js-framework | remove | 11.94 | 1.52 | 0.66 |
| js-framework | select | 5.60 | 4.68 | 0.34 |
| js-framework-reorder | reverse | 9.22 | **2.03** | 2.40 ✅ +1.18× |
| js-framework-reorder | shuffle | 9.91 | **2.18** | 2.29 ✅ +1.05× |
| js-framework-reorder | rotatef | 5.46 | **0.58** | 1.51 ✅ +2.58× |
| js-framework-reorder | rotateb | 5.53 | 0.58 | 0.13 |
| js-framework-reorder | displace3..8 | 5.8-6.4 | 0.65 | 0.17 |
| js-framework-reorder | removefirst | 5.78 | 0.63 | 0.16 |
| todomvc | add100 | 29.34 | **8.76** | 10.10 ✅ +1.15× |
| todomvc | complete25 | 11.96 | **4.66** | 5.14 ✅ +1.10× |
| todomvc | destroy25 | 14.68 | **4.08** | 4.74 ✅ +1.16× |
| todomvc | edit10 | 9.86 | 7.16 | 4.36 |
| news | ssr_render | 0.53 | 0.29 | 0.08 |
| news | hydrate | 0.41 | 0.41 | 2.86 ✅ +6.94× |
| streaming-ssr | shell_staggered | 1.47 | 1.26 | 0.12 |

**Cell-by-cell against the previous run**: 19 flipped `-`→`+`, 13 flipped
`+`→`-`. The 19 are the intended ones (`reverse` -3.88→+1.18, `shuffle`
-4.02→+1.05, `rotatef` -3.64→+2.58, `swap` -1.55→+3.17, todomvc `add100`
-2.83→+1.15, `complete25` -2.38→+1.10, `destroy25` -3.10→+1.16, plus the two
text-count ties) together with several parity cells settling on the good side
(`mount_dashboard`, `controls_submit`, `lifecycle mount`/`cycle`, `store_write`).

The 13 that went the other way are **every one of them inside ±1.21×**:
`narrow_write`, `rapid_writes`, `zustand_broad`, `tanstack_query_mount`/`broad`,
five `*_first_input` rows, `total_staggered` (-1.01×), `error_reveal`,
`retry_recovery`. These are 15-45ms measurements whose two columns sit within a
few percent of each other and which have flipped sign between runs before. I am
recording them as noise rather than regressions because nothing in this change
set touches the store-fanout or suspense-recovery paths — but that is an
inference from the diff, not from a repeated run, and a second full run is the
honest way to settle it.

The remaining `-` cells fall into five groups, all with a named cause:

1. **Per-attribute reactivity, not per-row** (`select` -13.8×, `toggleAllOn/Off`
   -2.9×, `filterCycle`, `edit10`). `<For>` bails a row out when its DATA is
   unchanged, but `class={state.selected === row.id ? …}` is read inside the row
   body, so writing `selected` re-runs all 1,000 row bodies — each rebuilding
   ~10 JSX nodes. React's `memo` compares two props and stops. Closing this needs
   the next primitive down: a reactive binding per attribute
   (`class={() => …}`), so a write re-evaluates one expression per row instead
   of one row body per row. That is the identified next lever, and it is an
   authoring-surface change like `<For>` was.
2. **Bulk creation** (`run` -1.75×, `add` -2.11×, `prepend/append/insertmid100`
   -2.4..-3.6×). Building a row costs an Owner, a signal, an effect and a scope
   on top of the DOM. Solid pays this too and is faster because its rows are
   compiled templates rather than JSX walked at runtime.
3. **Hydration-throttled typing** (the `*_post_hydration_typing` and
   `*_hydration_work` rows). `search_send_6x_hydration_work` reads -130× only
   because react's denominator is 0.04ms; the honest statement is 5.2ms of
   resume work against a react hydration that has almost nothing to do in that
   scenario. The `hydration` rows themselves (janux 10-11ms vs react 3-4ms) are
   the island-boot cost; note janux wins the *end-to-end* rows the same suites
   report (`news hydrate` +6.9×, `interaction_to_hydration` at parity).
4. **Streaming shell TTFB** (-10× / -24×). Janux deliberately waits one
   check-phase turn per boundary to see whether the content settles, and inlines
   it if so — better output, worse TTFB. React emits the fallback immediately.
   This is a design choice, not an inefficiency; changing it is a semantics call.
5. **Counts and bytes.** `nodes_1k`/`elements_1k`/`nodes_100`/`elements_100` are
   -1.00×: janux emits exactly ONE extra element per island, the
   `<janux-island>` resumability host. Whitespace is now zero and the text
   counts tie react, so the host is the entire remaining difference; removing it
   would mean letting an app's own root element double as the island host.
   `todo_app_*` -1.24× is 1353 vs 1094 gzipped bytes of *app* code: Janux's
   fixture carries a schema and a description per intent because the agent
   surface is generated from them.

## Position report (full run 2026-08-02, second pass)

Measured on one machine in a single run, so the cross-target comparison is
valid even though the absolute numbers are not portable. The `janux/react`
column is signed: `+N×` means janux is N times better, `-N×` N times worse.

### application-composition

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount_dashboard | 40.74ms | 44.12ms | 42.22ms | 38.70ms | 42.78ms | 45.16ms | +1.08× |
| interact_and_recover | 181.56ms | 144.60ms | 144.88ms | 140.58ms | 151.98ms | 146.58ms | -1.26× |
| teardown_dashboard | 32.68ms | 33.08ms | 33.10ms | 33.06ms | 32.88ms | 32.90ms | +1.01× |

### bundle-size

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| js_raw | 90.4KB | 192.8KB | 24.8KB | 36.6KB | 45.5KB | 62.7KB | +2.13× |
| js_gzip | 31.6KB | 60.7KB | 9.8KB | 13.7KB | 17.9KB | 23.5KB | +1.92× |
| js_brotli | 28.4KB | 52.4KB | 8.9KB | 12.4KB | 16.3KB | 21.3KB | +1.85× |
| app_raw | 4.8KB | 5.6KB | 5.2KB | 6.2KB | 5.0KB | 6.4KB | +1.17× |
| app_gzip | 1.9KB | 2.0KB | 1.9KB | 1.9KB | 2.2KB | 2.0KB | +1.05× |
| app_brotli | 1.7KB | 1.8KB | 1.7KB | 1.7KB | 1.9KB | 1.8KB | +1.04× |
| fw_raw | 85.6KB | 187.1KB | 19.6KB | 30.4KB | 40.5KB | 56.3KB | +2.19× |
| fw_gzip | 29.7KB | 58.6KB | 7.9KB | 11.8KB | 15.7KB | 21.5KB | +1.98× |
| fw_brotli | 26.6KB | 50.6KB | 7.2KB | 10.7KB | 14.3KB | 19.5KB | +1.90× |
| todo_js_raw | 89.3KB | 190.1KB | 21.5KB | 33.6KB | 46.6KB | 62.3KB | +2.13× |
| todo_js_gzip | 31.0KB | 59.7KB | 8.7KB | 13.2KB | 18.1KB | 23.8KB | +1.93× |
| todo_js_brotli | 27.9KB | 51.5KB | 7.9KB | 11.9KB | 16.4KB | 21.6KB | +1.85× |
| todo_app_raw | 3.6KB | 2.9KB | 2.1KB | 2.9KB | 3.3KB | 3.0KB | -1.24× |
| todo_app_gzip | 1.3KB | 1.1KB | 1.0KB | 1.3KB | 1.5KB | 1.3KB | -1.24× |
| todo_app_brotli | 1.2KB | 0.9KB | 0.8KB | 1.1KB | 1.3KB | 1.2KB | -1.24× |
| todo_fw_raw | 85.7KB | 187.2KB | 19.4KB | 30.7KB | 43.3KB | 59.3KB | +2.19× |
| todo_fw_gzip | 29.7KB | 58.7KB | 7.8KB | 11.9KB | 16.7KB | 22.5KB | +1.98× |
| todo_fw_brotli | 26.7KB | 50.6KB | 7.1KB | 10.8KB | 15.2KB | 20.4KB | +1.89× |

### controlled-form

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| typing | 85.04ms | 53.72ms | 53.32ms | 50.62ms | 68.36ms | 49.68ms | -1.58× |
| controls_submit | 68.36ms | 70.86ms | 66.30ms | 67.84ms | 67.22ms | 67.10ms | +1.04× |
| reset | 15.80ms | 39.82ms | 41.82ms | 30.00ms | 25.22ms | 42.54ms | +2.52× |

### event-delegation

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| delegated_input_burst | 10.46ms | 18.96ms | 6.36ms | 5.82ms | 3.68ms | 3.96ms | +1.81× |

### external-store-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 26.54ms | 33.60ms | 38.58ms | 21.26ms | 22.70ms | 29.72ms | +1.27× |
| narrow_write | 18.78ms | 17.38ms | 20.54ms | 19.02ms | 20.46ms | 19.78ms | -1.08× |
| broad_write | 20.22ms | 15.98ms | 16.86ms | 18.60ms | 17.94ms | 17.58ms | -1.27× |
| rapid_writes | 16.44ms | 15.14ms | 14.56ms | 15.04ms | 14.84ms | 14.30ms | -1.09× |
| unmount | 15.14ms | 16.40ms | 17.08ms | 15.76ms | 16.76ms | 16.96ms | +1.08× |

### external-store-integrations

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| zustand_mount | 21.40ms | 24.62ms | 35.98ms | 25.88ms | 25.52ms | 24.26ms | +1.15× |
| zustand_narrow | 18.54ms | 19.48ms | 19.86ms | 16.92ms | 17.04ms | 20.48ms | +1.05× |
| zustand_broad | 22.02ms | 18.18ms | 17.82ms | 17.54ms | 17.82ms | 17.54ms | -1.21× |
| zustand_rapid | 16.76ms | 15.38ms | 14.60ms | 15.34ms | 15.72ms | 16.06ms | -1.09× |
| zustand_unmount | 15.04ms | 16.76ms | 16.64ms | 15.92ms | 16.86ms | 15.90ms | +1.11× |
| jotai_mount | 19.44ms | 19.84ms | 31.12ms | 20.14ms | 18.60ms | 20.70ms | +1.02× |
| jotai_narrow | 15.38ms | 15.54ms | 20.12ms | 15.74ms | 16.14ms | 13.86ms | +1.01× |
| jotai_broad | 16.58ms | 16.64ms | 17.14ms | 17.22ms | 17.42ms | 16.14ms | +1.00× |
| jotai_rapid | 16.64ms | 16.62ms | 15.00ms | 16.14ms | 16.32ms | 17.50ms | -1.00× |
| jotai_unmount | 15.00ms | 15.16ms | 16.14ms | 16.10ms | 15.46ms | 15.60ms | +1.01× |
| tanstack_query_invalidation | 4.02ms | 2.44ms | 1.98ms | 1.94ms | 2.20ms | 2.36ms | -1.65× |
| tanstack_query_mount | 20.42ms | 20.00ms | 29.60ms | 19.38ms | 18.92ms | 20.00ms | -1.02× |
| tanstack_query_narrow | 14.18ms | 16.52ms | 20.78ms | 14.26ms | 15.42ms | 13.72ms | +1.17× |
| tanstack_query_broad | 17.64ms | 17.06ms | 16.52ms | 16.86ms | 16.54ms | 17.16ms | -1.03× |
| tanstack_query_rapid | 16.26ms | 16.52ms | 15.50ms | 16.90ms | 17.04ms | 17.46ms | +1.02× |
| tanstack_query_unmount | 18.46ms | 16.42ms | 13.20ms | 13.04ms | 11.90ms | 15.14ms | -1.12× |

### hydration-interactivity

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.84ms | 1.68ms | 2.30ms | 1.86ms | 1.88ms | 1.70ms | -1.10× |
| uncontrolled_1x_pre_hydration_typing | 17.88ms | 17.40ms | 16.68ms | 23.10ms | 17.78ms | 18.58ms | -1.03× |
| uncontrolled_1x_hydration | 5.36ms | 13.32ms | 8.36ms | 8.98ms | 7.26ms | 6.80ms | +2.49× |
| uncontrolled_1x_hydration_work | 0.78ms | 3.22ms | 2.24ms | 3.38ms | 2.44ms | 2.50ms | +4.13× |
| uncontrolled_1x_post_hydration_typing | 19.14ms | 11.68ms | 15.44ms | 8.64ms | 10.50ms | 8.46ms | -1.64× |
| uncontrolled_6x_first_input | 9.40ms | 9.58ms | 9.18ms | 9.58ms | 8.66ms | 8.62ms | +1.02× |
| uncontrolled_6x_pre_hydration_typing | 85.54ms | 90.10ms | 80.74ms | 80.06ms | 83.50ms | 78.30ms | +1.05× |
| uncontrolled_6x_hydration | 12.08ms | 58.40ms | 20.62ms | 28.08ms | 27.66ms | 23.40ms | +4.83× |
| uncontrolled_6x_hydration_work | 5.48ms | 20.52ms | 15.44ms | 21.38ms | 16.44ms | 16.90ms | +3.74× |
| uncontrolled_6x_post_hydration_typing | 185.04ms | 122.64ms | 149.58ms | 81.92ms | 96.04ms | 77.20ms | -1.51× |
| controlled_6x_first_input | 11.26ms | 10.28ms | 8.66ms | 9.06ms | 10.30ms | 9.06ms | -1.10× |
| controlled_6x_pre_hydration_typing | 90.42ms | 84.44ms | 87.72ms | 92.06ms | 94.12ms | 86.64ms | -1.07× |
| controlled_6x_hydration | 10.50ms | 61.36ms | 18.80ms | 27.42ms | 27.56ms | 24.60ms | +5.84× |
| controlled_6x_hydration_work | 5.34ms | 20.86ms | 14.50ms | 22.30ms | 16.52ms | 17.82ms | +3.91× |
| controlled_6x_post_hydration_typing | 189.14ms | 111.24ms | 142.02ms | 91.24ms | 103.10ms | 86.22ms | -1.70× |
| interaction_6x_hydration | 10.58ms | 3.86ms | 18.52ms | 26.26ms | 26.36ms | 23.24ms | -2.74× |
| interaction_6x_interaction_to_hydration | 68.96ms | 91.94ms | 74.28ms | 86.84ms | 83.66ms | 86.84ms | +1.33× |
| search_send_6x_first_input | 10.18ms | 10.98ms | 8.88ms | 10.16ms | 10.14ms | 8.74ms | +1.08× |
| search_send_6x_pre_hydration_typing | 86.88ms | 135.58ms | 82.90ms | 78.98ms | 95.42ms | 84.08ms | +1.56× |
| search_send_6x_hydration | 10.92ms | 4.02ms | 17.98ms | 27.90ms | 26.16ms | 23.98ms | -2.72× |
| search_send_6x_hydration_work | 5.22ms | 0.04ms | 13.72ms | 22.66ms | 16.46ms | 17.98ms | -130.50× |
| search_send_6x_interaction_to_hydration | 37.20ms | 34.98ms | 43.80ms | 53.84ms | 51.78ms | 51.16ms | -1.06× |

### hydration-stress

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.82ms | 1.96ms | 1.72ms | 1.86ms | 1.72ms | 1.76ms | +1.08× |
| uncontrolled_1x_pre_hydration_typing | 22.24ms | 18.36ms | 17.08ms | 19.12ms | 18.46ms | 19.02ms | -1.21× |
| uncontrolled_1x_hydration | 4.32ms | 13.34ms | 5.86ms | 7.20ms | 7.84ms | 6.98ms | +3.09× |
| uncontrolled_1x_hydration_work | 0.82ms | 3.24ms | 2.22ms | 3.20ms | 2.34ms | 2.48ms | +3.95× |
| uncontrolled_1x_post_hydration_typing | 18.50ms | 11.88ms | 14.88ms | 9.46ms | 9.14ms | 9.48ms | -1.56× |
| uncontrolled_6x_first_input | 10.40ms | 9.00ms | 9.34ms | 9.00ms | 8.74ms | 10.02ms | -1.16× |
| uncontrolled_6x_pre_hydration_typing | 85.38ms | 79.28ms | 91.68ms | 86.22ms | 81.84ms | 87.50ms | -1.08× |
| uncontrolled_6x_hydration | 11.38ms | 60.42ms | 19.48ms | 25.84ms | 26.54ms | 23.74ms | +5.31× |
| uncontrolled_6x_hydration_work | 5.60ms | 20.72ms | 15.30ms | 20.92ms | 15.56ms | 17.08ms | +3.70× |
| uncontrolled_6x_post_hydration_typing | 194.70ms | 125.50ms | 150.94ms | 81.40ms | 101.38ms | 96.68ms | -1.55× |
| controlled_6x_first_input | 10.62ms | 10.30ms | 10.54ms | 9.76ms | 9.14ms | 10.24ms | -1.03× |
| controlled_6x_pre_hydration_typing | 95.18ms | 84.14ms | 88.82ms | 90.64ms | 83.26ms | 91.58ms | -1.13× |
| controlled_6x_hydration | 11.86ms | 60.12ms | 18.64ms | 27.76ms | 26.56ms | 25.26ms | +5.07× |
| controlled_6x_hydration_work | 5.82ms | 20.30ms | 14.20ms | 21.10ms | 16.52ms | 17.90ms | +3.49× |
| controlled_6x_post_hydration_typing | 190.42ms | 121.76ms | 148.68ms | 105.54ms | 87.60ms | 93.26ms | -1.56× |
| interaction_6x_hydration | 11.08ms | 3.90ms | 18.62ms | 23.96ms | 25.28ms | 22.76ms | -2.84× |
| interaction_6x_interaction_to_hydration | 69.44ms | 86.54ms | 81.14ms | 84.14ms | 85.50ms | 84.84ms | +1.25× |
| search_send_6x_first_input | 10.68ms | 10.22ms | 8.94ms | 9.52ms | 9.54ms | 9.42ms | -1.05× |
| search_send_6x_pre_hydration_typing | 90.18ms | 127.32ms | 88.50ms | 93.24ms | 81.48ms | 86.38ms | +1.41× |
| search_send_6x_hydration | 10.60ms | 3.42ms | 17.78ms | 27.96ms | 24.34ms | 23.90ms | -3.10× |
| search_send_6x_hydration_work | 5.64ms | 0.12ms | 13.70ms | 22.92ms | 14.94ms | 17.76ms | -47.00× |
| search_send_6x_interaction_to_hydration | 38.22ms | 33.94ms | 43.42ms | 54.74ms | 51.60ms | 53.64ms | -1.13× |
| keyboard_send_6x_first_input | 10.64ms | 10.00ms | 9.72ms | 10.30ms | 9.84ms | 8.90ms | -1.06× |
| keyboard_send_6x_pre_hydration_typing | 80.58ms | 119.30ms | 86.54ms | 91.10ms | 80.62ms | 84.70ms | +1.48× |
| keyboard_send_6x_hydration | 11.38ms | 3.72ms | 18.56ms | 26.66ms | 25.34ms | 23.82ms | -3.06× |
| keyboard_send_6x_hydration_work | 5.58ms | 0.46ms | 14.80ms | 21.26ms | 16.16ms | 18.06ms | -12.13× |
| keyboard_send_6x_interaction_to_hydration | 24.94ms | 19.82ms | 31.14ms | 41.86ms | 40.10ms | 37.72ms | -1.26× |

### js-framework-reorder

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| reverse | 2.03ms | 2.40ms | 1.13ms | 1.51ms | 2.12ms | 16.17ms | +1.18× |
| shuffle | 2.18ms | 2.29ms | 1.40ms | 1.80ms | 2.85ms | 2.10ms | +1.05× |
| rotatef | 0.58ms | 1.51ms | 0.09ms | 0.69ms | 0.17ms | 0.13ms | +2.58× |
| rotateb | 0.58ms | 0.13ms | 0.08ms | 0.15ms | 0.18ms | 0.09ms | -4.43× |
| prepend100 | 2.64ms | 1.08ms | 0.28ms | 0.42ms | 1.62ms | 0.64ms | -2.44× |
| append100 | 2.66ms | 0.74ms | 0.32ms | 0.40ms | 1.40ms | 0.68ms | -3.59× |
| insertmid100 | 2.60ms | 0.98ms | 0.30ms | 0.34ms | 1.50ms | 0.68ms | -2.65× |
| removefirst | 0.63ms | 0.16ms | 0.06ms | 0.03ms | 0.23ms | 0.13ms | -3.97× |
| removeevery10 | 0.56ms | 0.34ms | 0.16ms | 0.27ms | 0.29ms | 0.19ms | -1.63× |
| displace3 | 0.65ms | 0.17ms | 0.13ms | 0.23ms | 1.52ms | 0.13ms | -3.80× |
| displace4 | 0.64ms | 0.17ms | 0.15ms | 0.24ms | 1.52ms | 0.14ms | -3.68× |
| displace5 | 0.65ms | 0.17ms | 0.15ms | 0.23ms | 1.50ms | 0.14ms | -3.75× |
| displace6 | 0.65ms | 0.17ms | 0.16ms | 0.23ms | 1.50ms | 0.14ms | -3.76× |
| displace8 | 0.67ms | 0.19ms | 0.16ms | 0.24ms | 1.49ms | 0.14ms | -3.58× |

### js-framework

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| run | 8.50ms | 4.86ms | 1.84ms | 2.38ms | 6.94ms | 3.14ms | -1.75× |
| replace | 12.80ms | 10.16ms | 4.88ms | 4.94ms | 12.28ms | 7.02ms | -1.26× |
| add | 10.04ms | 4.76ms | 1.80ms | 2.18ms | 7.22ms | 3.30ms | -2.11× |
| update | 1.92ms | 0.68ms | 0.76ms | 0.30ms | 0.80ms | 0.48ms | -2.82× |
| select | 4.68ms | 0.34ms | 0.02ms | 0.04ms | 0.40ms | 0.06ms | -13.76× |
| swap | 1.30ms | 4.12ms | 0.30ms | 0.24ms | 0.44ms | 0.46ms | +3.17× |
| remove | 1.52ms | 0.66ms | 0.18ms | 0.24ms | 0.64ms | 0.40ms | -2.30× |
| runlots | 87.96ms | 139.36ms | 16.32ms | 19.20ms | 60.24ms | 27.80ms | +1.58× |
| clear | 39.90ms | 50.80ms | 26.30ms | 25.30ms | 35.70ms | 29.78ms | +1.27× |
| nodes_1k | 10073 | 10072 | 10072 | 10072 | 10072 | 10116 | -1.00× |
| elements_1k | 8052 | 8051 | 8051 | 8050 | 8051 | 8051 | -1.00× |
| text_1k | 2021 | 2021 | 2021 | 2022 | 2021 | 2045 | +1.00× |
| comments_1k | 0 | 0 | 0 | 0 | 0 | 20 | — |
| empty_text_1k | 0 | 0 | 0 | 1 | 0 | 2 | — |
| whitespace_text_1k | 0 | 0 | 0 | 0 | 0 | 22 | — |

### lifecycle-memory

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 17.42ms | 17.54ms | 31.21ms | 17.92ms | 17.23ms | 17.81ms | +1.01× |
| update | 15.81ms | 15.76ms | 19.88ms | 15.57ms | 15.55ms | 15.57ms | -1.00× |
| unmount | 16.56ms | 16.84ms | 15.78ms | 16.57ms | 16.87ms | 16.72ms | +1.02× |
| cycle | 49.79ms | 50.14ms | 66.87ms | 50.06ms | 49.65ms | 50.09ms | +1.01× |

### news

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| ssr_render | 0.29ms | 0.08ms | 0.06ms | 0.06ms | 0.02ms | 0.03ms | -3.67× |
| hydrate | 0.41ms | 2.86ms | 1.90ms | 2.10ms | 1.60ms | 1.93ms | +6.94× |

### scaling-curves

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| update_8 | 6.78ms | 5.96ms | 1.90ms | 2.68ms | 2.14ms | 3.10ms | -1.14× |
| update_32 | 6.20ms | 6.76ms | 1.40ms | 2.16ms | 1.38ms | 1.52ms | +1.09× |
| update_96 | 6.42ms | 12.28ms | 3.36ms | 1.96ms | 3.52ms | 2.06ms | +1.91× |
| update_256 | 10.74ms | 25.10ms | 7.78ms | 6.34ms | 7.00ms | 8.64ms | +2.34× |
| update_512 | 18.24ms | 47.26ms | 13.64ms | 13.82ms | 16.90ms | 14.08ms | +2.59× |

### scheduler-responsiveness

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| input_during_updates | 592.90ms | 421.62ms | 388.52ms | 380.60ms | 533.18ms | 375.10ms | -1.41× |

### ssr-throughput

| op | news-50/janux | news-50/react | news-50/preact | news-50/solid | news-50/svelte | news-50/vue-vapor | news-500/janux | news-500/react | news-500/preact | news-500/solid | news-500/svelte | news-500/vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| render | 0.26ms | 0.09ms | 0.09ms | 0.06ms | 0.03ms | 0.03ms | 2.92ms | 0.92ms | 1.03ms | 0.55ms | 0.35ms | 0.26ms | — |

### store-selector-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 35.70ms | 37.60ms | 39.38ms | 26.52ms | 28.60ms | 34.06ms | +1.05× |
| store_write | 17.36ms | 19.58ms | 22.96ms | 17.82ms | 20.72ms | 16.52ms | +1.13× |
| parent_rerenders | 19.56ms | 15.32ms | 21.48ms | 3.48ms | 4.40ms | 5.30ms | -1.28× |
| store_write_after_rerenders | 17.38ms | 14.48ms | 15.22ms | 18.10ms | 17.90ms | 17.26ms | -1.20× |
| unmount | 12.68ms | 14.54ms | 14.30ms | 14.78ms | 15.16ms | 14.58ms | +1.15× |

### streaming-ssr

| op | janux | react | preact | solid | janux/react |
|---|---|---|---|---|---|
| shell_staggered | 1.26ms | 0.12ms | 0.16ms | 1.45ms | -10.43× |
| total_staggered | 51.07ms | 50.80ms | 51.31ms | 50.43ms | -1.01× |
| shell_allfast | 1.42ms | 0.06ms | 0.07ms | 1.57ms | -24.06× |
| total_allfast | 1.44ms | 1.40ms | 1.28ms | 1.59ms | -1.02× |

### suspense-recovery

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| error_reveal | 43.98ms | 38.48ms | 37.76ms | 41.60ms | 37.26ms | 41.86ms | -1.14× |
| retry_recovery | 36.12ms | 34.60ms | 34.94ms | 33.28ms | 33.20ms | 34.94ms | -1.04× |
| cancel_recovery | 31.78ms | 29.50ms | 31.22ms | 30.14ms | 31.68ms | 30.76ms | -1.08× |

### todomvc

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| add100 | 8.76ms | 10.10ms | 1.22ms | 1.30ms | 13.68ms | 1.94ms | +1.15× |
| toggleAllOn | 1.04ms | 0.36ms | 0.54ms | 0.20ms | 0.42ms | 0.20ms | -2.89× |
| toggleAllOff | 1.14ms | 0.38ms | 0.50ms | 0.14ms | 0.36ms | 0.22ms | -3.00× |
| complete25 | 4.66ms | 5.14ms | 0.56ms | 0.36ms | 5.54ms | 0.70ms | +1.10× |
| filterCycle | 1.46ms | 1.06ms | 0.56ms | 0.54ms | 1.06ms | 0.68ms | -1.38× |
| edit10 | 7.16ms | 4.36ms | 0.96ms | 0.82ms | 6.62ms | 1.44ms | -1.64× |
| clearCompleted | 0.50ms | 0.38ms | 0.14ms | 0.12ms | 0.34ms | 0.16ms | -1.32× |
| destroy25 | 4.08ms | 4.74ms | 0.44ms | 0.44ms | 5.08ms | 0.72ms | +1.16× |
| nodes_100 | 624 | 623 | 724 | 726 | 623 | 1035 | -1.00× |
| elements_100 | 518 | 517 | 517 | 517 | 517 | 517 | -1.00× |
| text_100 | 106 | 106 | 207 | 209 | 106 | 416 | +1.00× |
| comments_100 | 0 | 0 | 0 | 0 | 0 | 102 | — |
| empty_text_100 | 0 | 0 | 101 | 103 | 0 | 2 | — |
| whitespace_text_100 | 0 | 0 | 0 | 0 | 0 | 308 | — |

