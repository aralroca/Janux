import { onJanuxError } from './error-channel';
import { OVERLAY_CSS } from './overlay-css';
import { overlayMarkup, type DevErrorReport, type DevRoute } from './overlay-view';

/**
 * The dev error overlay. Dev only — `boot()` reaches it through
 * `import.meta.env?.DEV`, so a production build never contains a byte of it
 * (measured, not assumed: `packages/janux-cli/src/bundle-size.test.ts`).
 *
 * It renders the Janux chain of a failure, not just its stack: the route and
 * `_layout` chain that put the page there, the island the failure landed in,
 * the named intent/effect/source that ran, and — for an invocation — the guard
 * the pipeline resolved and the origin it resolved it for.
 */

const HOST_TAG = 'janux-dev-overlay';
/** Where `janux dev` answers which route and layouts a URL resolved to. */
const ROUTE_ENDPOINT = '/_janux/dev/route';

let host: HTMLElement | undefined;
let latest: DevErrorReport | undefined;
let count = 0;

/** A shadow root so the app's stylesheet cannot restyle the thing reporting its failure. */
function shadow(): ShadowRoot {
  if (host?.isConnected) return host.shadowRoot!;
  host = document.createElement(HOST_TAG);
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });

  root.addEventListener('click', (event) => {
    if ((event.target as Element).closest('[data-jx-close]')) dismissDevOverlay();
  });

  return root;
}

function render(): void {
  if (!latest) return;
  shadow().innerHTML = `<style>${OVERLAY_CSS}</style><section role="alert">${overlayMarkup(latest, count)}</section>`;
}

export function dismissDevOverlay(): void {
  host?.remove();
  host = undefined;
  latest = undefined;
  count = 0;
}

/** The route half of the chain lives in the router, which only the dev server can read. */
async function resolveRoute(report: DevErrorReport): Promise<void> {
  try {
    const response = await fetch(`${ROUTE_ENDPOINT}?path=${encodeURIComponent(location.pathname)}`);

    report.route = (await response.json()) as DevRoute;
  } catch {
    // The dev server is gone or restarting: the runtime half of the chain is
    // still worth showing, so this stays a missing row rather than a failure.
    return;
  }
  if (latest === report) render();
}

function show(report: DevErrorReport): void {
  count += 1;
  latest = report;
  render();
  resolveRoute(report).catch((failure) => console.error('[janux dev] overlay could not resolve the route', failure));
}

/**
 * Janux turns a failed intent into a `janux:error` DOM event, so the console
 * would otherwise stay empty and the stack unreachable. Uncaught errors are not
 * relogged — the browser already printed those itself.
 */
function reportExplained(error: unknown, chain: DevErrorReport['chain']): void {
  console.error(error);
  show({ error, chain });
}

/** Declared once so uninstalling cannot drift from installing. */
function documentListeners(): [EventTarget, string, EventListener][] {
  return [
    [window, 'error', (event) => show({ error: (event as ErrorEvent).error ?? (event as ErrorEvent).message })],
    [window, 'unhandledrejection', (event) => show({ error: (event as PromiseRejectionEvent).reason })],
    [document, 'keydown', (event) => (event as KeyboardEvent).key === 'Escape' && dismissDevOverlay()],
  ];
}

/** `boot()` runs again on re-boot and on HMR; installing twice would double every report. */
let installed: (() => void) | undefined;

export function installDevOverlay(): () => void {
  if (installed) return installed;
  const listeners = documentListeners();
  const stopChannel = onJanuxError(reportExplained);

  listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler));
  installed = () => {
    installed = undefined;
    stopChannel();
    listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
    dismissDevOverlay();
  };

  return installed;
}
