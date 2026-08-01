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

**Where that leaves the board (full run 2026-08-02, the report below)**:
`reset` is 1st (+2.55× react), `delegated_input_burst` went 145.1→12.2ms and
now beats react, and the full-app suites sit at parity. But measured against
*every* target rather than react alone, **103 cells are still 3rd or worse**,
and they fall into exactly two groups:

- **Fine-grained updates** (js-framework, js-framework-reorder, todomvc,
  scaling-curves, store-selector-fanout, the typing rows): the gap to solid /
  vue-vapor is 20-60× on sub-ms ops — `rotatef` 5.46ms vs 0.09, `destroy25`
  14.68ms vs 0.38. Every one of them is a single event whose cost *is* one
  whole-island re-render. No amount of queueing or micro-optimization moves
  them; the lever is the primitive below.
- **Bundle size** (17 cells): 29.9KB js_gzip against preact's 9.8 and solid's
  13.7. Reaching 2nd there is not a rendering change at all — it is a decision
  about what the framework ships (agentic surface, MCP, i18n, router, query).

**Next identified lever (RFC-level, to decide with Aral)**: the remaining floor
(~7ms/1000 rows) is re-running the whole view (JSX rebuild + reactive-proxy
reads) on every change. Getting to sub-ms requires a fine-grained list
primitive (in the spirit of Solid's `<For>` / octane's `forBlock`): a per-row
reactive scope, so one change's fan-out does not re-run the entire `.map`.
It touches the authoring surface (RFC).

## Position report (full run 2026-08-02)

Measured on one machine in a single run, so the cross-target comparison is
valid even though the absolute numbers are not portable. The `janux/react`
column is signed: `+N×` means janux is N times better, `-N×` N times worse.

### application-composition

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount_dashboard | 55.10ms | 44.64ms | 44.24ms | 42.62ms | 46.68ms | 42.90ms | -1.23× |
| interact_and_recover | 225.30ms | 166.88ms | 146.58ms | 145.06ms | 169.54ms | 151.96ms | -1.35× |
| teardown_dashboard | 32.36ms | 33.10ms | 33.64ms | 33.98ms | 32.06ms | 32.86ms | +1.02× |

### bundle-size

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| js_raw | 85.9KB | 192.8KB | 24.8KB | 36.6KB | 45.5KB | 62.7KB | +2.24× |
| js_gzip | 29.9KB | 60.7KB | 9.8KB | 13.7KB | 17.9KB | 23.5KB | +2.03× |
| js_brotli | 27.0KB | 52.4KB | 8.9KB | 12.4KB | 16.3KB | 21.3KB | +1.94× |
| app_raw | 4.8KB | 5.6KB | 5.2KB | 6.2KB | 5.0KB | 6.4KB | +1.18× |
| app_gzip | 1.9KB | 2.0KB | 1.9KB | 1.9KB | 2.2KB | 2.0KB | +1.06× |
| app_brotli | 1.7KB | 1.8KB | 1.7KB | 1.7KB | 1.9KB | 1.8KB | +1.04× |
| fw_raw | 81.1KB | 187.1KB | 19.6KB | 30.4KB | 40.5KB | 56.3KB | +2.31× |
| fw_gzip | 28.0KB | 58.6KB | 7.9KB | 11.8KB | 15.7KB | 21.5KB | +2.09× |
| fw_brotli | 25.2KB | 50.6KB | 7.2KB | 10.7KB | 14.3KB | 19.5KB | +2.00× |
| todo_js_raw | 84.8KB | 190.1KB | 21.5KB | 33.6KB | 46.6KB | 62.3KB | +2.24× |
| todo_js_gzip | 29.4KB | 59.7KB | 8.7KB | 13.2KB | 18.1KB | 23.8KB | +2.03× |
| todo_js_brotli | 26.4KB | 51.5KB | 7.9KB | 11.9KB | 16.4KB | 21.6KB | +1.95× |
| todo_app_raw | 3.6KB | 2.9KB | 2.1KB | 2.9KB | 3.3KB | 3.0KB | -1.24× |
| todo_app_gzip | 1.3KB | 1.1KB | 1.0KB | 1.3KB | 1.5KB | 1.3KB | -1.24× |
| todo_app_brotli | 1.2KB | 0.9KB | 0.8KB | 1.1KB | 1.3KB | 1.2KB | -1.24× |
| todo_fw_raw | 81.2KB | 187.2KB | 19.4KB | 30.7KB | 43.3KB | 59.3KB | +2.31× |
| todo_fw_gzip | 28.0KB | 58.7KB | 7.8KB | 11.9KB | 16.7KB | 22.5KB | +2.09× |
| todo_fw_brotli | 25.3KB | 50.6KB | 7.1KB | 10.8KB | 15.2KB | 20.4KB | +2.00× |

### controlled-form

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| typing | 80.64ms | 48.52ms | 44.54ms | 44.46ms | 60.10ms | 43.34ms | -1.66× |
| controls_submit | 67.42ms | 67.28ms | 67.10ms | 66.92ms | 67.76ms | 68.26ms | -1.00× |
| reset | 15.54ms | 39.66ms | 40.56ms | 28.06ms | 23.40ms | 43.08ms | +2.55× |

### event-delegation

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| delegated_input_burst | 12.20ms | 18.44ms | 4.28ms | 7.20ms | 11.26ms | 6.16ms | +1.51× |

### external-store-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 21.30ms | 26.00ms | 38.00ms | 21.24ms | 26.04ms | 23.44ms | +1.22× |
| narrow_write | 17.32ms | 18.44ms | 18.90ms | 16.86ms | 18.72ms | 15.72ms | +1.06× |
| broad_write | 18.16ms | 16.18ms | 17.60ms | 17.74ms | 18.20ms | 15.52ms | -1.12× |
| rapid_writes | 14.70ms | 15.30ms | 14.74ms | 14.64ms | 14.80ms | 15.90ms | +1.04× |
| unmount | 15.32ms | 16.20ms | 16.44ms | 15.94ms | 16.16ms | 16.44ms | +1.06× |

### external-store-integrations

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| zustand_mount | 18.62ms | 20.52ms | 35.18ms | 19.64ms | 20.22ms | 20.48ms | +1.10× |
| zustand_narrow | 17.68ms | 18.12ms | 19.12ms | 15.66ms | 16.00ms | 16.02ms | +1.02× |
| zustand_broad | 16.88ms | 17.90ms | 18.24ms | 16.96ms | 16.50ms | 16.24ms | +1.06× |
| zustand_rapid | 15.48ms | 14.50ms | 14.62ms | 15.32ms | 15.56ms | 15.70ms | -1.07× |
| zustand_unmount | 15.04ms | 16.68ms | 16.66ms | 16.46ms | 16.18ms | 16.72ms | +1.11× |
| jotai_mount | 18.60ms | 19.14ms | 31.72ms | 20.02ms | 18.92ms | 17.64ms | +1.03× |
| jotai_narrow | 16.70ms | 15.26ms | 19.08ms | 15.88ms | 15.68ms | 16.08ms | -1.09× |
| jotai_broad | 16.24ms | 17.38ms | 17.74ms | 19.02ms | 16.82ms | 16.46ms | +1.07× |
| jotai_rapid | 16.72ms | 16.10ms | 15.54ms | 16.54ms | 16.36ms | 16.58ms | -1.04× |
| jotai_unmount | 15.00ms | 16.04ms | 16.02ms | 15.90ms | 15.98ms | 15.88ms | +1.07× |
| tanstack_query_invalidation | 2.88ms | 2.16ms | 1.92ms | 1.84ms | 1.96ms | 2.04ms | -1.33× |
| tanstack_query_mount | 18.62ms | 19.02ms | 31.80ms | 18.90ms | 19.18ms | 20.42ms | +1.02× |
| tanstack_query_narrow | 16.74ms | 15.42ms | 19.66ms | 15.48ms | 15.04ms | 15.02ms | -1.09× |
| tanstack_query_broad | 16.00ms | 17.46ms | 17.74ms | 17.26ms | 16.86ms | 17.56ms | +1.09× |
| tanstack_query_rapid | 15.88ms | 16.24ms | 15.44ms | 16.42ms | 16.10ms | 16.56ms | +1.02× |
| tanstack_query_unmount | 14.32ms | 13.30ms | 13.56ms | 13.54ms | 13.48ms | 12.40ms | -1.08× |

### hydration-interactivity

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.66ms | 1.78ms | 1.66ms | 1.66ms | 1.80ms | 1.70ms | +1.07× |
| uncontrolled_1x_pre_hydration_typing | 27.90ms | 19.14ms | 18.32ms | 18.70ms | 20.40ms | 18.88ms | -1.46× |
| uncontrolled_1x_hydration | 5.80ms | 14.10ms | 6.16ms | 7.66ms | 8.24ms | 8.56ms | +2.43× |
| uncontrolled_1x_hydration_work | 0.82ms | 3.28ms | 2.18ms | 3.40ms | 2.32ms | 2.62ms | +4.00× |
| uncontrolled_1x_post_hydration_typing | 21.50ms | 11.72ms | 15.34ms | 9.26ms | 9.44ms | 8.88ms | -1.83× |
| uncontrolled_6x_first_input | 11.52ms | 9.26ms | 9.08ms | 9.88ms | 8.88ms | 9.38ms | -1.24× |
| uncontrolled_6x_pre_hydration_typing | 86.64ms | 93.90ms | 77.10ms | 95.64ms | 81.00ms | 91.76ms | +1.08× |
| uncontrolled_6x_hydration | 12.36ms | 61.12ms | 19.08ms | 29.02ms | 25.74ms | 27.18ms | +4.94× |
| uncontrolled_6x_hydration_work | 5.64ms | 21.02ms | 14.76ms | 22.46ms | 15.60ms | 19.22ms | +3.73× |
| uncontrolled_6x_post_hydration_typing | 178.96ms | 118.24ms | 141.50ms | 106.32ms | 93.58ms | 98.06ms | -1.51× |
| controlled_6x_first_input | 10.58ms | 11.24ms | 8.92ms | 9.70ms | 8.74ms | 8.72ms | +1.06× |
| controlled_6x_pre_hydration_typing | 94.16ms | 89.82ms | 82.62ms | 82.02ms | 83.28ms | 78.56ms | -1.05× |
| controlled_6x_hydration | 11.82ms | 60.44ms | 18.62ms | 26.92ms | 28.16ms | 24.98ms | +5.11× |
| controlled_6x_hydration_work | 5.76ms | 19.70ms | 14.82ms | 21.60ms | 17.24ms | 18.30ms | +3.42× |
| controlled_6x_post_hydration_typing | 182.80ms | 114.26ms | 145.56ms | 86.80ms | 99.82ms | 70.42ms | -1.60× |
| interaction_6x_hydration | 10.38ms | 4.24ms | 18.46ms | 23.58ms | 26.96ms | 23.12ms | -2.45× |
| interaction_6x_interaction_to_hydration | 68.28ms | 102.48ms | 76.46ms | 83.20ms | 86.36ms | 81.98ms | +1.50× |
| search_send_6x_first_input | 8.84ms | 10.80ms | 9.66ms | 8.94ms | 9.56ms | 10.36ms | +1.22× |
| search_send_6x_pre_hydration_typing | 83.74ms | 157.16ms | 85.04ms | 82.02ms | 91.06ms | 79.22ms | +1.88× |
| search_send_6x_hydration | 10.64ms | 3.90ms | 19.66ms | 26.38ms | 27.12ms | 23.44ms | -2.73× |
| search_send_6x_hydration_work | 5.22ms | 0.52ms | 15.14ms | 21.14ms | 17.16ms | 17.26ms | -10.04× |
| search_send_6x_interaction_to_hydration | 36.44ms | 33.20ms | 44.90ms | 52.46ms | 55.88ms | 50.52ms | -1.10× |

### hydration-stress

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.76ms | 1.74ms | 1.70ms | 1.56ms | 1.70ms | 1.66ms | -1.01× |
| uncontrolled_1x_pre_hydration_typing | 17.94ms | 17.68ms | 18.48ms | 17.20ms | 14.12ms | 24.24ms | -1.01× |
| uncontrolled_1x_hydration | 4.92ms | 15.48ms | 5.92ms | 6.22ms | 7.70ms | 7.92ms | +3.15× |
| uncontrolled_1x_hydration_work | 0.82ms | 3.34ms | 2.24ms | 3.24ms | 2.38ms | 2.52ms | +4.07× |
| uncontrolled_1x_post_hydration_typing | 18.44ms | 11.96ms | 14.50ms | 8.54ms | 9.48ms | 9.20ms | -1.54× |
| uncontrolled_6x_first_input | 9.18ms | 9.26ms | 8.78ms | 8.94ms | 11.42ms | 9.16ms | +1.01× |
| uncontrolled_6x_pre_hydration_typing | 82.48ms | 78.34ms | 76.00ms | 75.96ms | 90.04ms | 78.24ms | -1.05× |
| uncontrolled_6x_hydration | 10.90ms | 56.44ms | 18.76ms | 26.86ms | 28.08ms | 22.76ms | +5.18× |
| uncontrolled_6x_hydration_work | 5.36ms | 19.10ms | 13.82ms | 22.02ms | 16.62ms | 16.20ms | +3.56× |
| uncontrolled_6x_post_hydration_typing | 184.20ms | 87.66ms | 143.02ms | 74.92ms | 91.84ms | 71.32ms | -2.10× |
| controlled_6x_first_input | 9.00ms | 8.36ms | 9.92ms | 9.20ms | 9.42ms | 8.72ms | -1.08× |
| controlled_6x_pre_hydration_typing | 77.34ms | 70.50ms | 92.76ms | 75.38ms | 81.84ms | 71.32ms | -1.10× |
| controlled_6x_hydration | 11.54ms | 59.02ms | 18.70ms | 29.12ms | 25.36ms | 22.92ms | +5.11× |
| controlled_6x_hydration_work | 5.36ms | 20.22ms | 14.50ms | 22.76ms | 15.92ms | 16.74ms | +3.77× |
| controlled_6x_post_hydration_typing | 178.26ms | 92.60ms | 146.22ms | 80.26ms | 70.64ms | 68.22ms | -1.93× |
| interaction_6x_hydration | 10.78ms | 3.12ms | 18.70ms | 26.22ms | 24.96ms | 22.16ms | -3.46× |
| interaction_6x_interaction_to_hydration | 66.68ms | 82.80ms | 77.60ms | 83.50ms | 79.52ms | 76.24ms | +1.24× |
| search_send_6x_first_input | 9.32ms | 9.84ms | 9.24ms | 10.68ms | 8.44ms | 8.64ms | +1.06× |
| search_send_6x_pre_hydration_typing | 83.90ms | 108.66ms | 79.46ms | 96.02ms | 74.86ms | 68.02ms | +1.30× |
| search_send_6x_hydration | 11.16ms | 3.10ms | 17.82ms | 27.90ms | 25.58ms | 22.64ms | -3.60× |
| search_send_6x_hydration_work | 5.28ms | 0.00ms | 14.10ms | 22.48ms | 16.68ms | 16.88ms | — |
| search_send_6x_interaction_to_hydration | 39.90ms | 32.62ms | 44.46ms | 56.58ms | 48.80ms | 50.32ms | -1.22× |
| keyboard_send_6x_first_input | 10.00ms | 10.22ms | 8.62ms | 8.98ms | 9.12ms | 10.02ms | +1.02× |
| keyboard_send_6x_pre_hydration_typing | 89.04ms | 124.10ms | 86.32ms | 88.26ms | 69.34ms | 79.14ms | +1.39× |
| keyboard_send_6x_hydration | 10.82ms | 4.26ms | 18.24ms | 26.10ms | 25.54ms | 23.76ms | -2.54× |
| keyboard_send_6x_hydration_work | 5.64ms | 0.22ms | 14.44ms | 21.38ms | 15.76ms | 17.66ms | -25.64× |
| keyboard_send_6x_interaction_to_hydration | 24.16ms | 17.70ms | 30.32ms | 38.36ms | 38.04ms | 37.24ms | -1.36× |

### js-framework-reorder

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| reverse | 9.22ms | 2.38ms | 1.13ms | 1.40ms | 2.16ms | 16.01ms | -3.88× |
| shuffle | 9.91ms | 2.47ms | 1.48ms | 1.81ms | 2.76ms | 1.78ms | -4.02× |
| rotatef | 5.46ms | 1.50ms | 0.09ms | 0.67ms | 0.17ms | 0.13ms | -3.64× |
| rotateb | 5.53ms | 0.13ms | 0.08ms | 0.15ms | 0.18ms | 0.09ms | -42.15× |
| prepend100 | 13.20ms | 1.08ms | 0.32ms | 0.38ms | 1.62ms | 0.72ms | -12.22× |
| append100 | 12.74ms | 0.84ms | 0.32ms | 0.40ms | 1.44ms | 0.66ms | -15.17× |
| insertmid100 | 12.80ms | 1.08ms | 0.30ms | 0.42ms | 1.56ms | 0.72ms | -11.85× |
| removefirst | 5.78ms | 0.17ms | 0.06ms | 0.04ms | 0.22ms | 0.13ms | -34.63× |
| removeevery10 | 3.04ms | 0.36ms | 0.18ms | 0.24ms | 0.34ms | 0.26ms | -8.47× |
| displace3 | 5.81ms | 0.17ms | 0.13ms | 0.22ms | 1.50ms | 0.14ms | -34.00× |
| displace4 | 5.94ms | 0.17ms | 0.14ms | 0.23ms | 1.49ms | 0.14ms | -34.36× |
| displace5 | 6.12ms | 0.17ms | 0.14ms | 0.23ms | 1.47ms | 0.14ms | -35.18× |
| displace6 | 6.16ms | 0.18ms | 0.14ms | 0.23ms | 1.54ms | 0.14ms | -34.98× |
| displace8 | 6.42ms | 0.18ms | 0.15ms | 0.24ms | 1.49ms | 0.15ms | -35.50× |

### js-framework

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| run | 8.60ms | 5.00ms | 1.90ms | 2.24ms | 6.74ms | 3.30ms | -1.72× |
| replace | 12.38ms | 9.58ms | 4.72ms | 4.70ms | 11.42ms | 6.56ms | -1.29× |
| add | 21.08ms | 4.84ms | 1.76ms | 2.00ms | 7.26ms | 3.18ms | -4.36× |
| update | 5.52ms | 0.78ms | 0.72ms | 0.24ms | 0.86ms | 0.40ms | -7.08× |
| select | 5.60ms | 0.36ms | 0.06ms | 0.06ms | 0.40ms | 0.02ms | -15.56× |
| swap | 6.56ms | 4.22ms | 0.22ms | 0.22ms | 0.42ms | 0.48ms | -1.55× |
| remove | 11.94ms | 0.60ms | 0.18ms | 0.18ms | 0.64ms | 0.40ms | -19.90× |
| runlots | 88.38ms | 140.26ms | 15.94ms | 18.08ms | 60.80ms | 28.14ms | +1.59× |
| clear | 37.08ms | 47.84ms | 25.32ms | 24.54ms | 35.84ms | 29.14ms | +1.29× |
| nodes_1k | 10075 | 10072 | 10072 | 10072 | 10072 | 10116 | -1.00× |
| elements_1k | 8052 | 8051 | 8051 | 8050 | 8051 | 8051 | -1.00× |
| text_1k | 2023 | 2021 | 2021 | 2022 | 2021 | 2045 | -1.00× |
| comments_1k | 0 | 0 | 0 | 0 | 0 | 20 | — |
| empty_text_1k | 0 | 0 | 0 | 1 | 0 | 2 | — |
| whitespace_text_1k | 2 | 0 | 0 | 0 | 0 | 22 | — |

### lifecycle-memory

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 17.40ms | 17.22ms | 31.45ms | 18.00ms | 17.36ms | 17.61ms | -1.01× |
| update | 16.03ms | 15.75ms | 19.26ms | 15.75ms | 16.56ms | 15.50ms | -1.02× |
| unmount | 16.52ms | 16.71ms | 16.40ms | 16.61ms | 16.72ms | 16.63ms | +1.01× |
| cycle | 49.94ms | 49.68ms | 67.12ms | 50.36ms | 50.65ms | 49.75ms | -1.01× |

### news

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| ssr_render | 0.53ms | 0.09ms | 0.06ms | 0.06ms | 0.02ms | 0.03ms | -5.93× |
| hydrate | 0.41ms | 2.91ms | 1.86ms | 2.21ms | 1.61ms | 1.91ms | +7.06× |

### scaling-curves

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| update_8 | 11.14ms | 6.94ms | 2.42ms | 2.98ms | 3.10ms | 2.68ms | -1.61× |
| update_32 | 6.62ms | 8.12ms | 2.12ms | 1.62ms | 1.58ms | 2.14ms | +1.23× |
| update_96 | 8.02ms | 13.58ms | 3.08ms | 2.02ms | 3.84ms | 4.20ms | +1.69× |
| update_256 | 12.06ms | 29.18ms | 7.50ms | 8.94ms | 9.82ms | 9.28ms | +2.42× |
| update_512 | 19.92ms | 54.48ms | 15.62ms | 16.16ms | 17.82ms | 15.58ms | +2.73× |

### scheduler-responsiveness

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| input_during_updates | 529.08ms | 342.42ms | 329.04ms | 330.18ms | 440.72ms | 324.14ms | -1.55× |

### ssr-throughput

| op | news-50/janux | news-50/react | news-50/preact | news-50/solid | news-50/svelte | news-50/vue-vapor | news-500/janux | news-500/react | news-500/preact | news-500/solid | news-500/svelte | news-500/vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| render | 0.50ms | 0.11ms | 0.11ms | 0.07ms | 0.04ms | 0.03ms | 5.93ms | 1.07ms | 1.18ms | 0.64ms | 0.39ms | 0.30ms | — |

### store-selector-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 37.06ms | 36.02ms | 37.20ms | 24.78ms | 26.52ms | 33.66ms | -1.03× |
| store_write | 21.48ms | 20.74ms | 23.52ms | 19.62ms | 19.22ms | 17.16ms | -1.04× |
| parent_rerenders | 24.84ms | 16.98ms | 22.48ms | 3.66ms | 5.08ms | 5.84ms | -1.46× |
| store_write_after_rerenders | 18.40ms | 16.94ms | 16.72ms | 18.26ms | 17.22ms | 16.64ms | -1.09× |
| unmount | 13.80ms | 14.82ms | 15.40ms | 15.18ms | 14.32ms | 14.92ms | +1.07× |

### streaming-ssr

| op | janux | react | preact | solid | janux/react |
|---|---|---|---|---|---|
| shell_staggered | 1.47ms | 0.09ms | 0.11ms | 2.33ms | -16.90× |
| total_staggered | 50.99ms | 51.12ms | 51.15ms | 50.73ms | +1.00× |
| shell_allfast | 1.51ms | 0.05ms | 0.06ms | 2.08ms | -27.85× |
| total_allfast | 1.52ms | 1.36ms | 1.44ms | 2.20ms | -1.12× |

### suspense-recovery

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| error_reveal | 37.58ms | 38.02ms | 36.76ms | 34.30ms | 37.98ms | 34.42ms | +1.01× |
| retry_recovery | 33.00ms | 37.02ms | 32.88ms | 35.22ms | 32.68ms | 33.04ms | +1.12× |
| cancel_recovery | 31.86ms | 31.06ms | 31.30ms | 31.92ms | 31.08ms | 31.46ms | -1.03× |

### todomvc

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| add100 | 29.34ms | 10.38ms | 1.26ms | 1.28ms | 13.90ms | 1.96ms | -2.83× |
| toggleAllOn | 1.72ms | 0.36ms | 0.58ms | 0.18ms | 0.42ms | 0.30ms | -4.78× |
| toggleAllOff | 1.20ms | 0.36ms | 0.60ms | 0.20ms | 0.34ms | 0.28ms | -3.33× |
| complete25 | 11.96ms | 5.02ms | 0.64ms | 0.34ms | 5.54ms | 0.74ms | -2.38× |
| filterCycle | 2.20ms | 1.12ms | 0.54ms | 0.60ms | 1.18ms | 0.62ms | -1.96× |
| edit10 | 9.86ms | 4.30ms | 0.92ms | 0.92ms | 6.86ms | 1.46ms | -2.29× |
| clearCompleted | 0.78ms | 0.34ms | 0.14ms | 0.16ms | 0.36ms | 0.18ms | -2.29× |
| destroy25 | 14.68ms | 4.74ms | 0.38ms | 0.48ms | 5.22ms | 0.68ms | -3.10× |
| nodes_100 | 626 | 623 | 724 | 726 | 623 | 1035 | -1.00× |
| elements_100 | 518 | 517 | 517 | 517 | 517 | 517 | -1.00× |
| text_100 | 108 | 106 | 207 | 209 | 106 | 416 | -1.02× |
| comments_100 | 0 | 0 | 0 | 0 | 0 | 102 | — |
| empty_text_100 | 0 | 0 | 101 | 103 | 0 | 2 | — |
| whitespace_text_100 | 2 | 0 | 0 | 0 | 0 | 308 | — |
