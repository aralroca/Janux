# Baseline — julio 2026 (pre-optimización)

Primera medición completa de Janux 0.4.0 contra react 19.2 / preact 10.29 /
solid 2.0-beta / svelte 5.56 / vue-vapor 3.6-rc en las 19 suites portadas de
octane. Máquina: ver `README.md` (Apple M4 Pro, 24 GB, macOS 26.5.2, Node 26,
Bun 1.3.14, Chromium 151 headless). Iteraciones normales, `--record`.

Estado del runtime al medir: ya incluye los dos primeros cambios del bucle
(morph keyed + batching de intents — sin ellos el corpus de reorder ni entraba
y `update` costaba 1816ms).

## Lecturas clave (tras el bucle de optimización)

- **Paridad o victoria en suites de app completa**: lifecycle 1.00×react, stores 0.83-1.27×, submit 0.92×, reset 0.40×, scheduler 1.48×, composition 1.26×, suspense-recovery ≈1.0×.
- **Resume aplasta a la hidratación**: news hydrate 0.13×react; hydration 6× throttle 0.19-0.20×; hydration_work 0.22-0.24×.
- **Bundle**: 24.7KB js_gzip total = 0.40×react; 4º de 6 (preact 10.0, solid 14.1, svelte 18.4, janux 24.7≈vue-vapor 24.1, react 62.1).
- **Creación masiva**: runlots 0.64×, clear 0.75×.
- **Gaps honestos con causa conocida**: micro-ops krausest sub-ms (select 16.8×, remove 20×— exige primitiva de lista de grano fino, RFC abajo) y SSR throughput (4.5× — pipeline de emisión de strings, siguiente palanca de servidor).
- **scaling-curves ya es ~lineal**: 19.5/41/101/258/508ms para 8/32/96/256/512 (era 127/454/1281/3470/7609).

## Intentos y descartes del bucle de optimización

Registro obligatorio: cada optimización intentada, su hipótesis, y el delta
medido — también las que se revierten.

| # | Cambio | Hipótesis | Delta medido | Estado |
|---|---|---|---|---|
| 1 | Morph keyed (client/keys.ts) | la gate de identidad del reorder exige mover nodos, no reescribirlos | reorder: de gate imposible a verde | ✅ commiteado |
| 2 | Batching de intents + computeds pull-on-read | N writes síncronos = 1 flush sin dejar derived stale | update 1816→25.9ms | ✅ commiteado |
| 3 | External react en fixtures (= foreignExternals del plugin) | los chunks lazy de react-dom no son bytes enviados | fw_gzip 82.2→22.1KB | ✅ commiteado (fixture, no core) |
| 4 | Coalescer como push pump (fix, no opt) | ~600 timers de 0ms por render nunca disparan bajo bucle de microtasks y fijan su maquinaria | 810MB→0.6MB por 1000 renders SSR; el OOM de ssr-throughput desaparece | ✅ commiteado — encontrado POR el harness |
| 5 | Reconciliador JSX-contra-DOM (reconcile.ts) | construir el árbol descartable con toDomNodes era el coste fijo dominante | select 26.2→16.2, update 24.4→17.1, swap 28.8→22.4 | ✅ commiteado |
| 6 | sameProps/sameValue + LIS + fast-paths sin key (guiado por perfil CPU: matchState 22%) | props value-equal no reserializan; listas sin key no pagan Map/Set/LIS; intents bound equivalentes son "sin cambio" | select→7.4, update→8.4, swap→9.9; runlots 0.63×react, clear 0.89× | ✅ commiteado |

**Siguiente palanca identificada (nivel RFC, para decidir con Aral)**: el suelo
restante (~7ms/1000 filas) es re-ejecutar la vista entera (rebuild del JSX +
lecturas del proxy reactivo) por cada cambio. Bajar a sub-ms exige una
primitiva de lista de grano fino (estilo `<For>` de Solid / `forBlock` de
octane): scope reactivo por fila, de forma que el fan-out de un cambio no
re-ejecute el `.map` completo. Afecta a la superficie de autoría (RFC).

## Informe de posición (post-optimización, run completa 2026-07-29)

## Benchmark position report

### application-composition

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount_dashboard | 42.06ms | 42.24ms | 44.06ms | 40.12ms | 40.62ms | 38.36ms | 1.00× |
| interact_and_recover | 179.30ms | 142.42ms | 136.44ms | 134.44ms | 148.56ms | 138.88ms | 1.26× |
| teardown_dashboard | 33.36ms | 33.12ms | 33.52ms | 32.06ms | 33.68ms | 32.84ms | 1.01× |

### bundle-size

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| js_raw | 68.9KB | 192.8KB | 24.8KB | 36.6KB | 45.5KB | 62.7KB | 0.36× |
| js_gzip | 24.2KB | 60.7KB | 9.8KB | 13.7KB | 17.9KB | 23.5KB | 0.40× |
| js_brotli | 21.8KB | 52.4KB | 8.9KB | 12.4KB | 16.3KB | 21.3KB | 0.42× |
| app_raw | 4.8KB | 5.6KB | 5.2KB | 6.2KB | 5.0KB | 6.4KB | 0.85× |
| app_gzip | 1.9KB | 2.0KB | 1.9KB | 1.9KB | 2.2KB | 2.0KB | 0.95× |
| app_brotli | 1.7KB | 1.8KB | 1.7KB | 1.7KB | 1.9KB | 1.8KB | 0.96× |
| fw_raw | 64.1KB | 187.1KB | 19.6KB | 30.4KB | 40.5KB | 56.3KB | 0.34× |
| fw_gzip | 22.2KB | 58.6KB | 7.9KB | 11.8KB | 15.7KB | 21.5KB | 0.38× |
| fw_brotli | 20.1KB | 50.6KB | 7.2KB | 10.7KB | 14.3KB | 19.5KB | 0.40× |
| todo_js_raw | 67.7KB | 190.1KB | 21.5KB | 33.6KB | 46.6KB | 62.3KB | 0.36× |
| todo_js_gzip | 23.6KB | 59.7KB | 8.7KB | 13.2KB | 18.1KB | 23.8KB | 0.39× |
| todo_js_brotli | 21.2KB | 51.5KB | 7.9KB | 11.9KB | 16.4KB | 21.6KB | 0.41× |
| todo_app_raw | 3.6KB | 2.9KB | 2.1KB | 2.9KB | 3.3KB | 3.0KB | 1.23× |
| todo_app_gzip | 1.3KB | 1.1KB | 1.0KB | 1.3KB | 1.5KB | 1.3KB | 1.22× |
| todo_app_brotli | 1.2KB | 0.9KB | 0.8KB | 1.1KB | 1.3KB | 1.2KB | 1.22× |
| todo_fw_raw | 64.2KB | 187.2KB | 19.4KB | 30.7KB | 43.3KB | 59.3KB | 0.34× |
| todo_fw_gzip | 22.2KB | 58.7KB | 7.8KB | 11.9KB | 16.7KB | 22.5KB | 0.38× |
| todo_fw_brotli | 20.1KB | 50.6KB | 7.1KB | 10.8KB | 15.2KB | 20.4KB | 0.40× |

### controlled-form

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| typing | 77.82ms | 45.30ms | 43.18ms | 41.86ms | 56.08ms | 42.84ms | 1.72× |
| controls_submit | 64.30ms | 69.58ms | 65.70ms | 66.12ms | 67.50ms | 67.22ms | 0.92× |
| reset | 15.42ms | 39.02ms | 41.42ms | 27.94ms | 23.08ms | 41.54ms | 0.40× |

### event-delegation

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| delegated_input_burst | 145.14ms | 17.94ms | 3.36ms | 3.56ms | 5.34ms | 5.74ms | 8.09× |

### external-store-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 22.14ms | 21.76ms | 36.18ms | 22.26ms | 24.92ms | 21.22ms | 1.02× |
| narrow_write | 22.78ms | 17.98ms | 18.64ms | 14.48ms | 14.82ms | 18.76ms | 1.27× |
| broad_write | 16.14ms | 16.96ms | 17.56ms | 16.22ms | 15.16ms | 16.48ms | 0.95× |
| rapid_writes | 16.48ms | 15.46ms | 15.70ms | 15.42ms | 15.98ms | 15.50ms | 1.07× |
| unmount | 15.32ms | 16.52ms | 17.20ms | 16.06ms | 16.52ms | 16.74ms | 0.93× |

### external-store-integrations

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| zustand_mount | 20.82ms | 25.18ms | 28.10ms | 20.70ms | 21.20ms | 16.94ms | 0.83× |
| zustand_narrow | 18.78ms | 17.06ms | 19.06ms | 14.26ms | 14.74ms | 15.06ms | 1.10× |
| zustand_broad | 15.76ms | 16.58ms | 18.30ms | 17.32ms | 16.40ms | 16.64ms | 0.95× |
| zustand_rapid | 16.78ms | 15.64ms | 14.62ms | 15.42ms | 15.94ms | 16.02ms | 1.07× |
| zustand_unmount | 15.06ms | 17.14ms | 16.82ms | 16.10ms | 16.68ms | 16.34ms | 0.88× |
| jotai_mount | 19.20ms | 19.48ms | 31.76ms | 20.20ms | 19.22ms | 19.92ms | 0.99× |
| jotai_narrow | 16.54ms | 15.06ms | 19.88ms | 14.38ms | 15.06ms | 14.96ms | 1.10× |
| jotai_broad | 16.28ms | 17.36ms | 18.14ms | 17.38ms | 17.28ms | 16.80ms | 0.94× |
| jotai_rapid | 16.70ms | 16.32ms | 15.26ms | 16.42ms | 16.44ms | 16.66ms | 1.02× |
| jotai_unmount | 15.00ms | 15.72ms | 15.74ms | 15.80ms | 15.76ms | 15.64ms | 0.95× |
| tanstack_query_invalidation | 4.02ms | 2.48ms | 2.42ms | 2.22ms | 2.30ms | 2.36ms | 1.62× |
| tanstack_query_mount | 19.32ms | 19.62ms | 31.10ms | 19.36ms | 18.86ms | 21.16ms | 0.98× |
| tanstack_query_narrow | 17.02ms | 14.88ms | 19.76ms | 14.94ms | 15.92ms | 13.44ms | 1.14× |
| tanstack_query_broad | 15.74ms | 17.66ms | 18.92ms | 17.20ms | 16.70ms | 17.02ms | 0.89× |
| tanstack_query_rapid | 16.48ms | 16.32ms | 14.94ms | 16.46ms | 16.72ms | 16.70ms | 1.01× |
| tanstack_query_unmount | 17.88ms | 16.26ms | 14.24ms | 14.02ms | 12.50ms | 12.40ms | 1.10× |

### hydration-interactivity

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.58ms | 1.68ms | 1.56ms | 1.50ms | 1.68ms | 1.56ms | 0.94× |
| uncontrolled_1x_pre_hydration_typing | 17.68ms | 18.66ms | 15.24ms | 15.84ms | 18.50ms | 16.62ms | 0.95× |
| uncontrolled_1x_hydration | 5.68ms | 10.78ms | 8.54ms | 7.52ms | 6.86ms | 7.62ms | 0.53× |
| uncontrolled_1x_hydration_work | 0.70ms | 3.02ms | 2.18ms | 3.06ms | 2.24ms | 2.36ms | 0.23× |
| uncontrolled_1x_post_hydration_typing | 18.62ms | 11.78ms | 14.46ms | 7.70ms | 9.46ms | 8.60ms | 1.58× |
| uncontrolled_6x_first_input | 7.80ms | 7.80ms | 8.54ms | 8.44ms | 8.54ms | 8.02ms | 1.00× |
| uncontrolled_6x_pre_hydration_typing | 70.66ms | 72.48ms | 70.30ms | 70.90ms | 84.34ms | 67.86ms | 0.97× |
| uncontrolled_6x_hydration | 10.74ms | 52.64ms | 18.42ms | 24.64ms | 26.88ms | 21.58ms | 0.20× |
| uncontrolled_6x_hydration_work | 4.12ms | 17.50ms | 13.12ms | 19.26ms | 15.66ms | 15.06ms | 0.24× |
| uncontrolled_6x_post_hydration_typing | 161.94ms | 90.56ms | 105.36ms | 72.34ms | 87.48ms | 64.20ms | 1.79× |
| controlled_6x_first_input | 8.16ms | 7.86ms | 9.22ms | 7.98ms | 8.52ms | 7.78ms | 1.04× |
| controlled_6x_pre_hydration_typing | 71.44ms | 64.08ms | 68.48ms | 75.80ms | 81.18ms | 64.46ms | 1.11× |
| controlled_6x_hydration | 10.44ms | 53.04ms | 17.18ms | 26.18ms | 26.40ms | 21.38ms | 0.20× |
| controlled_6x_hydration_work | 4.30ms | 18.10ms | 13.24ms | 20.32ms | 15.72ms | 14.88ms | 0.24× |
| controlled_6x_post_hydration_typing | 149.62ms | 86.02ms | 107.62ms | 70.26ms | 79.74ms | 61.42ms | 1.74× |
| interaction_6x_hydration | 10.46ms | 3.76ms | 16.70ms | 21.26ms | 23.24ms | 19.98ms | 2.78× |
| interaction_6x_interaction_to_hydration | 64.16ms | 80.08ms | 64.84ms | 72.66ms | 76.40ms | 70.80ms | 0.80× |
| search_send_6x_first_input | 8.54ms | 9.32ms | 8.86ms | 8.20ms | 9.30ms | 8.38ms | 0.92× |
| search_send_6x_pre_hydration_typing | 67.48ms | 102.58ms | 86.42ms | 65.22ms | 78.74ms | 63.70ms | 0.66× |
| search_send_6x_hydration | 11.00ms | 3.54ms | 18.32ms | 23.46ms | 24.28ms | 22.06ms | 3.11× |
| search_send_6x_hydration_work | 4.90ms | 0.14ms | 14.42ms | 18.92ms | 14.84ms | 15.90ms | 35.00× |
| search_send_6x_interaction_to_hydration | 39.00ms | 29.44ms | 44.54ms | 49.70ms | 48.98ms | 46.12ms | 1.32× |

### hydration-stress

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| uncontrolled_1x_first_input | 1.60ms | 1.80ms | 1.50ms | 1.46ms | 1.42ms | 1.46ms | 0.89× |
| uncontrolled_1x_pre_hydration_typing | 17.06ms | 17.48ms | 15.56ms | 15.22ms | 14.82ms | 14.96ms | 0.98× |
| uncontrolled_1x_hydration | 5.62ms | 14.04ms | 6.64ms | 10.68ms | 8.42ms | 6.98ms | 0.40× |
| uncontrolled_1x_hydration_work | 0.74ms | 3.04ms | 2.16ms | 3.04ms | 2.08ms | 2.32ms | 0.24× |
| uncontrolled_1x_post_hydration_typing | 19.48ms | 11.68ms | 14.94ms | 8.28ms | 8.32ms | 8.10ms | 1.67× |
| uncontrolled_6x_first_input | 8.76ms | 10.68ms | 7.58ms | 7.82ms | 8.22ms | 7.88ms | 0.82× |
| uncontrolled_6x_pre_hydration_typing | 79.22ms | 101.40ms | 68.42ms | 73.82ms | 62.14ms | 63.62ms | 0.78× |
| uncontrolled_6x_hydration | 11.50ms | 59.68ms | 19.76ms | 24.80ms | 23.14ms | 22.28ms | 0.19× |
| uncontrolled_6x_hydration_work | 4.60ms | 21.12ms | 13.70ms | 19.48ms | 13.24ms | 14.84ms | 0.22× |
| uncontrolled_6x_post_hydration_typing | 187.86ms | 134.80ms | 128.12ms | 74.22ms | 58.20ms | 58.24ms | 1.39× |
| controlled_6x_first_input | 9.84ms | 9.52ms | 8.78ms | 7.90ms | 7.82ms | 7.66ms | 1.03× |
| controlled_6x_pre_hydration_typing | 91.24ms | 96.64ms | 75.20ms | 62.98ms | 62.14ms | 65.58ms | 0.94× |
| controlled_6x_hydration | 11.64ms | 62.64ms | 18.44ms | 24.00ms | 22.60ms | 21.92ms | 0.19× |
| controlled_6x_hydration_work | 4.86ms | 22.26ms | 14.00ms | 19.18ms | 13.62ms | 15.02ms | 0.22× |
| controlled_6x_post_hydration_typing | 194.08ms | 149.50ms | 116.80ms | 59.06ms | 59.28ms | 58.00ms | 1.30× |
| interaction_6x_hydration | 11.18ms | 3.98ms | 15.86ms | 22.08ms | 21.26ms | 19.80ms | 2.81× |
| interaction_6x_interaction_to_hydration | 72.92ms | 81.56ms | 64.24ms | 75.58ms | 68.08ms | 67.60ms | 0.89× |
| search_send_6x_first_input | 10.10ms | 9.88ms | 8.20ms | 7.74ms | 7.22ms | 7.36ms | 1.02× |
| search_send_6x_pre_hydration_typing | 100.50ms | 143.78ms | 64.36ms | 69.80ms | 60.16ms | 61.28ms | 0.70× |
| search_send_6x_hydration | 11.32ms | 3.76ms | 18.18ms | 25.20ms | 21.84ms | 19.94ms | 3.01× |
| search_send_6x_hydration_work | 5.10ms | 0.26ms | 13.80ms | 19.84ms | 13.60ms | 14.78ms | 19.62× |
| search_send_6x_interaction_to_hydration | 36.06ms | 29.96ms | 43.26ms | 52.78ms | 47.44ms | 46.32ms | 1.20× |
| keyboard_send_6x_first_input | 8.20ms | 11.00ms | 8.20ms | 8.28ms | 7.44ms | 7.70ms | 0.75× |
| keyboard_send_6x_pre_hydration_typing | 75.80ms | 139.30ms | 74.32ms | 69.74ms | 61.22ms | 61.30ms | 0.54× |
| keyboard_send_6x_hydration | 10.64ms | 4.24ms | 16.76ms | 23.02ms | 21.94ms | 19.82ms | 2.51× |
| keyboard_send_6x_hydration_work | 4.94ms | 0.28ms | 13.02ms | 18.70ms | 13.76ms | 14.34ms | 17.64× |
| keyboard_send_6x_interaction_to_hydration | 22.44ms | 20.42ms | 28.94ms | 34.60ms | 32.70ms | 31.10ms | 1.10× |

### js-framework-reorder

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| reverse | 8.66ms | 2.10ms | 1.03ms | 1.31ms | 2.01ms | 15.89ms | 4.13× |
| shuffle | 8.48ms | 1.86ms | 1.24ms | 1.65ms | 2.82ms | 1.83ms | 4.57× |
| rotatef | 5.17ms | 1.44ms | 0.08ms | 0.64ms | 0.16ms | 0.13ms | 3.59× |
| rotateb | 5.07ms | 0.13ms | 0.07ms | 0.14ms | 0.16ms | 0.08ms | 39.76× |
| prepend100 | 12.68ms | 0.94ms | 0.26ms | 0.36ms | 1.68ms | 0.62ms | 13.49× |
| append100 | 12.44ms | 0.76ms | 0.28ms | 0.38ms | 1.46ms | 0.66ms | 16.37× |
| insertmid100 | 12.56ms | 0.92ms | 0.28ms | 0.30ms | 1.36ms | 0.70ms | 13.65× |
| removefirst | 5.57ms | 0.15ms | 0.06ms | 0.03ms | 0.21ms | 0.12ms | 37.87× |
| removeevery10 | 2.73ms | 0.32ms | 0.17ms | 0.21ms | 0.30ms | 0.17ms | 8.50× |
| displace3 | 5.61ms | 0.16ms | 0.13ms | 0.22ms | 1.59ms | 0.13ms | 36.21× |
| displace4 | 5.55ms | 0.16ms | 0.14ms | 0.22ms | 1.63ms | 0.13ms | 34.87× |
| displace5 | 5.57ms | 0.16ms | 0.14ms | 0.22ms | 1.49ms | 0.13ms | 35.69× |
| displace6 | 5.53ms | 0.16ms | 0.14ms | 0.22ms | 1.45ms | 0.13ms | 34.55× |
| displace8 | 5.46ms | 0.17ms | 0.14ms | 0.21ms | 1.36ms | 0.13ms | 31.96× |

### js-framework

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| run | 10.02ms | 5.64ms | 2.10ms | 2.90ms | 7.50ms | 4.00ms | 1.78× |
| replace | 13.28ms | 10.00ms | 6.04ms | 5.90ms | 13.20ms | 7.76ms | 1.33× |
| add | 21.52ms | 4.96ms | 1.84ms | 2.20ms | 7.04ms | 3.46ms | 4.34× |
| update | 7.20ms | 1.08ms | 0.98ms | 0.38ms | 1.24ms | 0.62ms | 6.67× |
| select | 7.74ms | 0.46ms | 0.08ms | 0.10ms | 0.60ms | 0.04ms | 16.83× |
| swap | 8.76ms | 4.54ms | 0.40ms | 0.36ms | 0.70ms | 0.64ms | 1.93× |
| remove | 13.68ms | 0.68ms | 0.16ms | 0.24ms | 0.80ms | 0.54ms | 20.12× |
| runlots | 84.86ms | 131.76ms | 15.44ms | 18.46ms | 59.60ms | 27.64ms | 0.64× |
| clear | 36.04ms | 48.36ms | 26.68ms | 24.74ms | 35.04ms | 28.96ms | 0.75× |
| nodes_1k | 10075 | 10072 | 10072 | 10072 | 10072 | 10116 | 1.00× |
| elements_1k | 8052 | 8051 | 8051 | 8050 | 8051 | 8051 | 1.00× |
| text_1k | 2023 | 2021 | 2021 | 2022 | 2021 | 2045 | 1.00× |
| comments_1k | 0 | 0 | 0 | 0 | 0 | 20 | — |
| empty_text_1k | 0 | 0 | 0 | 1 | 0 | 2 | — |
| whitespace_text_1k | 2 | 0 | 0 | 0 | 0 | 22 | — |

### lifecycle-memory

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 17.00ms | 17.10ms | 30.57ms | 17.60ms | 17.32ms | 17.34ms | 0.99× |
| update | 15.74ms | 15.49ms | 19.15ms | 15.26ms | 15.25ms | 15.30ms | 1.02× |
| unmount | 16.41ms | 16.66ms | 16.60ms | 16.46ms | 16.75ms | 16.69ms | 0.98× |
| cycle | 49.14ms | 49.25ms | 66.32ms | 49.33ms | 49.33ms | 49.33ms | 1.00× |

### news

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| ssr_render | 0.54ms | 0.06ms | 0.06ms | 0.06ms | 0.02ms | 0.02ms | 8.84× |
| hydrate | 0.33ms | 2.58ms | 1.75ms | 1.87ms | 1.56ms | 1.85ms | 0.13× |

### scaling-curves

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| update_8 | 19.46ms | 4.72ms | 1.82ms | 2.66ms | 1.84ms | 2.20ms | 4.12× |
| update_32 | 41.32ms | 5.90ms | 1.40ms | 1.46ms | 3.76ms | 1.80ms | 7.00× |
| update_96 | 101.30ms | 11.84ms | 2.62ms | 1.68ms | 2.08ms | 2.86ms | 8.56× |
| update_256 | 257.88ms | 23.62ms | 5.14ms | 6.52ms | 6.12ms | 5.82ms | 10.92× |
| update_512 | 508.12ms | 44.36ms | 13.46ms | 12.72ms | 14.66ms | 12.48ms | 11.45× |

### scheduler-responsiveness

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| input_during_updates | 491.46ms | 331.44ms | 302.52ms | 321.44ms | 446.18ms | 300.20ms | 1.48× |

### ssr-throughput

| op | news-50/janux | news-50/react | news-50/preact | news-50/solid | news-50/svelte | news-50/vue-vapor | news-500/janux | news-500/react | news-500/preact | news-500/solid | news-500/svelte | news-500/vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| render | 0.39ms | 0.09ms | 0.08ms | 0.05ms | 0.03ms | 0.02ms | 4.68ms | 0.89ms | 0.89ms | 0.51ms | 0.31ms | 0.24ms | — |

### store-selector-fanout

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| mount | 34.46ms | 25.20ms | 37.10ms | 23.08ms | 22.16ms | 27.22ms | 1.37× |
| store_write | 20.18ms | 20.54ms | 22.94ms | 18.34ms | 15.68ms | 20.64ms | 0.98× |
| parent_rerenders | 20.80ms | 14.18ms | 20.70ms | 3.32ms | 4.18ms | 5.20ms | 1.47× |
| store_write_after_rerenders | 17.82ms | 16.90ms | 16.52ms | 18.50ms | 16.94ms | 16.60ms | 1.05× |
| unmount | 14.44ms | 14.88ms | 14.06ms | 15.28ms | 15.76ms | 15.80ms | 0.97× |

### streaming-ssr

| op | janux | react | preact | solid | janux/react |
|---|---|---|---|---|---|
| shell_staggered | 1.93ms | 0.40ms | 0.57ms | 2.06ms | 4.87× |
| total_staggered | 50.71ms | 51.34ms | 51.28ms | 51.04ms | 0.99× |
| shell_allfast | 1.78ms | 0.11ms | 0.12ms | 2.00ms | 16.00× |
| total_allfast | 1.79ms | 1.44ms | 1.27ms | 2.06ms | 1.25× |

### suspense-recovery

| op | janux | react | preact | solid | svelte | vue-vapor | janux/react |
|---|---|---|---|---|---|---|---|
| error_reveal | 43.22ms | 39.30ms | 35.12ms | 38.60ms | 40.50ms | 33.24ms | 1.10× |
| retry_recovery | 35.18ms | 32.64ms | 32.94ms | 36.52ms | 33.04ms | 33.20ms | 1.08× |
| cancel_recovery | 31.76ms | 31.44ms | 32.08ms | 31.46ms | 32.20ms | 31.84ms | 1.01× |

### todomvc

| op | janux | react | solid | vue-vapor | preact | svelte | janux/react |
|---|---|---|---|---|---|---|---|
| add100 | 33.12ms | 11.24ms | 1.88ms | 1.56ms | 17.04ms | 3.40ms | 2.95× |
| toggleAllOn | 1.24ms | 0.40ms | 0.66ms | 0.16ms | 0.52ms | 0.34ms | 3.10× |
| toggleAllOff | 1.08ms | 0.40ms | 0.66ms | 0.18ms | 0.48ms | 0.36ms | 2.70× |
| complete25 | 11.76ms | 6.16ms | 0.76ms | 0.56ms | 6.92ms | 1.10ms | 1.91× |
| filterCycle | 2.12ms | 1.22ms | 0.84ms | 0.72ms | 1.30ms | 0.84ms | 1.74× |
| edit10 | 9.36ms | 4.78ms | 1.30ms | 1.34ms | 7.82ms | 2.64ms | 1.96× |
| clearCompleted | 0.72ms | 0.44ms | 0.22ms | 0.24ms | 0.38ms | 0.22ms | 1.64× |
| destroy25 | 13.64ms | 5.42ms | 0.52ms | 0.74ms | 6.08ms | 0.86ms | 2.52× |
| nodes_100 | 626 | 623 | 724 | 726 | 623 | 1035 | 1.00× |
| elements_100 | 518 | 517 | 517 | 517 | 517 | 517 | 1.00× |
| text_100 | 108 | 106 | 207 | 209 | 106 | 416 | 1.02× |
| comments_100 | 0 | 0 | 0 | 0 | 0 | 102 | — |
| empty_text_100 | 0 | 0 | 101 | 103 | 0 | 2 | — |
| whitespace_text_100 | 2 | 0 | 0 | 0 | 0 | 308 | — |


