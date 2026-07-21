# PLAN — Docs de calidad, demo pulida y template nuevo de create-janux

> Estado repo: movido a `Didit/Janux`; `bun install` reparó los tests (82/82 verificado). Sin fase de reparación.

## Supuestos (vetar aquí si algo no encaja)

1. **Template**: sustituir el counter por una app **"Tasks"** (task manager con copilot) — enseña intents, derived, store (tema), api(), guards y copilot en ~4 componentes. Alternativas descartadas: counter mejorado (poco músculo), clon del shop (redundante con la demo).
2. **Docs 0-JS se mantiene**: highlighting con **shiki en SSR** (tema oscuro único acorde a la paleta), TOC/anchors/nav móvil CSS-only. Único JS: el copilot (como ahora).
3. Contenido en **inglés**; secciones de sidebar por carpetas: `guide/`, `reference/`, `recipes/`.
4. Solo 3 features nuevas de framework (A1-A3); todo lo demás es app-land. Nada especulativo.

## Bloque A — Enablers mínimos de framework

- **A1. `public/`**: dev middleware sirve `public/*`; `janux build` lo copia a `dist/client`; `start` ya sirve ese dir. → verify: `curl /logo.svg` en dev y en start (200, content-type correcto).
- **A2. `export const meta = { title, description }`** por ruta → `<title>` + meta description en el shell. → verify: test en `server.test.ts` + curl del `<head>`.
- **A3. Bridge emite `janux:tool-call`** (CustomEvent con `{tool, input, phase: 'start'|'ok'|'error'}`) en `call()`. → verify: test en `boot.test.ts` (listener captura start+ok).

## Bloque B — Docs: estilos

- **B1. Shiki SSR**: dep en `apps/docs`; highlighter singleton (`createHighlighter`, langs: ts/tsx/bash/json/css/html; 1 tema oscuro); override de `renderer.code` de marked. → verify: screenshot con colores + página doc sigue sin `<script>`.
- **B2. Landing rediseñada**: hero (logo desde `public/`, headline con gradiente, install block, CTAs a Getting started y GitHub), grid de 6 feature-cards, sección "two faces" (código del componente ↔ manifest JSON real, lado a lado), footer con links npm/GitHub/release. → verify: screenshot Chrome.
- **B3. Chrome de página doc**: anchors con id en h2/h3, **TOC derecha** por página (parse de headings en SSR), **prev/next**, breadcrumb, sidebar agrupada por sección con activo, menú móvil con `<details>` CSS-only. → verify: screenshots desktop (1440) y móvil (390).
- **B4. Callouts**: `> **Note:**` / `> **Warning:**` → admonitions con estilo. → verify: screenshot.
- **B5. Favicon + og meta** (usa A1+A2). → verify: `<head>` por curl.

## Bloque C — Docs: contenido (lo gordo)

- **C1. Reorganizar** las 11 páginas a `content/guide/` y adaptar `docs.api` (recursivo + secciones + orden). → verify: sidebar agrupada; grep de links internos rotos = 0.
- **C2. Reference (6 páginas nuevas)**: core-api, schema-api, server-api, agent-api, client-api (bridge/`window.janux`), cli. Firmas + tabla de opciones + ejemplo por entrada, fieles a la implementación. → verify: render + `searchDocs` las encuentra.
- **C3. Tutorial en 3 partes**: "Build a task manager with a built-in copilot" — (1) scaffold+componente+intents, (2) api()+sources+effects+store, (3) copilot+guards+proposals+settled. **Coincide 1:1 con el template nuevo (E1)**. → verify: seguirlo desde `create-janux` reproduce la app.
- **C4. Recipes (5)**: testing components (bun:test+createInstance), auth con `ctxFor`, eventos cross-isla, deploy (Dockerfile Bun), consumir el manifest desde un cliente MCP externo. → verify: render + snippets coherentes con la API.
- **C5. FAQ + Comparison** (React/Qwik/Astro/HTMX/CopilotKit, desde el RFC) **+ Glossary**. → verify: render.

## Bloque D — Demo shop

- **D1. Visual**: header con nav+logo, grid de productos en cards (arte SVG/gradiente por producto), cart panel sticky, empty states, **toast** en `cart.checkedOut`, favicon+meta. → verify: screenshots.
- **D2. Funcionalidad**: qty +/− (`changeQty`), quitar línea, **cupón SAVE10** (intent + descuento en `derived.total`), banner de pedido confirmado. → verify: tests de intents con `createInstance` + Chrome.
- **D3. Copilot demo-ready**: suggestion chips iniciales (funcionan sin API key llamando al bridge directamente), líneas de actividad de tools en el chat vía A3 ("→ cart.addItem ✓"), indicador busy, **glow en la isla** cuando el agente actúa (CSS + evento A3). → verify: Chrome, chips ejecutan y se ve el glow.
- **D4. Ruta dinámica `/orders/[id]`** usando `orderStatus` (muestra routing con params). → verify: curl + Chrome.

## Bloque E — Template create-janux ("Tasks")

- **E1.** TaskBoard island (form añadir, toggle, borrar, filtros all/active/done, counts derived), store `theme` (dark/light con `persist`), `tasks.api.ts` (persistencia en memoria + `guard:'confirm'` en clear-all), copilot flotante, estilos al nivel de las docs, README propio del template y **un test de ejemplo** (`task-board.test.ts` con `createInstance`) para enseñar la historia de testing. → verify: `create-janux` en /tmp + link local + dev + Chrome + su test pasa.
- **E2.** Consistencia template ↔ tutorial C3. → verify: revisión cruzada manual.

## Bloque G — Playground (Monaco + ejecución real en navegador)

La pieza diferencial: no es solo "editar y ver la UI" — el playground enseña **las dos caras a la vez**: preview renderizada + **panel de agente** (manifest vivo, invocador de tools, inspector del resource, proposals con approve/reject). "See what the agent sees", interactivo.

- **G1. Ruta `/playground`** en apps/docs con layout de 3 paneles: **Monaco** (código) | **Preview** (iframe sandbox) | **Agent panel**. Monaco carga lazy solo en esta ruta (docs siguen 0-JS); workers `editor`+`ts` vía `?worker` de Vite + `MonacoEnvironment.getWorker`; `compilerOptions` con `jsx` + `jsxImportSource: 'janux'`; **IntelliSense de Janux** vía `typescriptDefaults.addExtraLib` con un `playground/janux-types.d.ts` curado (superficie pública, mantenido a mano — más estable que alimentar los fuentes). → verify: autocompletado de `component({` visible en screenshot.
- **G2. Runtime de ejecución**: bundle único `playground/runtime.js` (build extra de Vite) que exporta el core de janux + jsx-runtime + helper `mountPlayground(def, el)` (createInstance + attach + render loop con toDomNodes/morph) + **sucrase**. El iframe (sandbox `allow-scripts`, srcdoc) usa **import map** `{"janux": "/playground/runtime.js", "janux/jsx-runtime": ...}`; protocolo postMessage: parent envía `{code}` → iframe transpila con sucrase (`transforms: ['typescript','jsx']`, `jsxRuntime: 'automatic'`, `jsxImportSource: 'janux'`) → Blob module → `import()` → detecta los `ComponentDef` exportados → monta. Errores de compilación/runtime → overlay en preview + marker en Monaco. → verify: ejemplo por defecto renderiza y un click en la preview muta estado.
- **G3. Agent panel**: el iframe publica manifest + resource snapshot tras cada `settled()`; el parent lista tools con sus guards, permite invocar con inputs (form generado del JSON Schema), muestra el resource actualizado, y los `confirm` aparecen como proposal con Approve/Reject que ejecuta en el iframe. Log de eventos emitidos. → verify: invocar `counter.inc` desde el panel actualiza la preview; proposal de un `confirm` se aprueba y aplica.
- **G4. "Try it" desde las docs**: fences marcados ` ```tsx live ` reciben botón "▶ Run in playground" → `/playground#c=<base64url del código>`; el playground lee el hash. Dropdown de ejemplos (counter, cart con guards, store compartido, eventos). Botón share (copia URL). → verify: click en un Try it de la doc de Components abre el playground con ese código funcionando.
- **G5. Honestidad de peso**: Monaco (~700 KB gz) y sucrase viven SOLO en `/playground`; ninguna página de docs los referencia. → verify: páginas doc siguen sin `<script>`; `/playground` documentado como herramienta.
- Tests: unit del transform sucrase (fence de ejemplo compila y evalúa a un def con `kind:'component'`), smoke del runtime bundle, y e2e Chrome del flujo completo (editar → render → tool call → proposal). Playwright accede dentro del iframe.

## Bloque F — Cierre obligatorio (no opcional)

1. **Test manual Chrome** (Playwright channel chrome, guión completo: docs home/página/TOC/móvil; **playground**: editar código → preview reactiva → tool call desde el agent panel → proposal approve → "Try it" desde una doc; shop add→coupon→checkout→approve con toast y glow; template Tasks entero) — **iterar hasta que esté bien**.
2. **Tests automatizados**: A1-A3 (framework), intents del cart, TaskBoard, `docs.api` con secciones, smoke de shiki (HTML contiene spans de tokens). Todos verdes + `bun run typecheck`.
3. **Simplify** del diff completo.
4. **Code review** del diff + aplicar fixes.
5. **Re-verificación total**: suite + typecheck + screenshots finales.

## Orden y riesgos

Orden: **A → B → G → C → D → E → F** (estilos y playground antes que el contenido, para que las páginas nuevas puedan usar fences `tsx live` desde el primer borrador). Riesgos: renombrar content rompe links internos (mitigado con grep-check en C1); shiki solo server-side (singleton en módulo del route, jamás importado desde client.ts); Monaco/sucrase solo en `/playground` (vigilar que ningún import se cuele en el client entry general); el import map del iframe debe cubrir `janux`, `janux/jsx-runtime` y `janux/client`; los chips demo del copilot no fingen respuestas del modelo — ejecutan tools reales vía bridge y se etiquetan como demo.

Referencias del research: Monaco+Vite workers y `addExtraLib` (docs oficiales integrate-esm), sucrase `jsxRuntime: 'automatic'` + `jsxImportSource` (README/wiki), shiki server-side (shiki.style, docs de Astro).
