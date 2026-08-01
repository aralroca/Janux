import { component, intent, jsx, renderToString } from 'janux';
import { boot, type JanuxClient } from 'janux/client';
import type { ComponentDef, IntentDef, IntentRef } from '../../janux/src/define/types';

/**
 * The scaffold every case in this area shares: server-render one island,
 * inject its state snapshots exactly as the shell does, and resume it.
 *
 * Cases assert what a *user* can observe — the DOM, the audit trail, the
 * intent's own promise — never how many render passes produced it: the render
 * loop is free to coalesce a burst of events into one pass.
 */
export interface Booted {
  client: JanuxClient;
  html: string;
}

/** A component with the fixed name `w`, so a case can say `client.call('w.go')` without repeating itself. */
export function island(spec: Partial<ComponentDef> & { view: ComponentDef['view'] }): ComponentDef {
  return component({ name: 'w', ...spec } as never) as ComponentDef;
}

/** `intent()` with the `any`-shaped bag every row uses — the corpus asserts behaviour, not inference. */
export function act(def: IntentDef): IntentDef {
  return intent(def);
}

export type Intents = Record<string, IntentRef & ((input?: unknown) => Promise<unknown>)>;

function snapshotScripts(snapshots: { uri: string; state: unknown; sources?: unknown }[]): string {
  return snapshots
    .map(
      (snap) =>
        `<script type="application/janux+state" data-uri="${snap.uri}">${JSON.stringify({
          state: snap.state,
          sources: snap.sources ?? {},
        })}</script>`,
    )
    .join('');
}

/** SSR-only: the HTML one island produces, with no client attached. */
export async function render(def: ComponentDef): Promise<string> {
  const { html } = await renderToString(jsx(def as never, {}), {});

  return html;
}

/** SSR + resume. `defs` beyond the first are registered too (nested islands). */
export async function serve(def: ComponentDef, options: { ctx?: Record<string, unknown>; defs?: ComponentDef[]; onAudit?: (entry: unknown) => void } = {}): Promise<Booted> {
  document.body.innerHTML = '';
  const { html, snapshots } = await renderToString(jsx(def as never, {}), {});

  document.body.innerHTML = html + snapshotScripts(snapshots as never);

  const client = boot({
    defs: [def, ...(options.defs ?? [])] as never,
    ctx: options.ctx,
    onAudit: options.onAudit as never,
    // Off by default: this area is about events and intents, and a navigation
    // interceptor or a WebMCP registration would answer document clicks too.
    navigation: false,
    webmcp: false,
  });

  return { client, html };
}

/**
 * Boots the document a second time, as an HMR reload or a stray second
 * `boot()` would. The delegated listeners are installed once per document and
 * dispatch to the CURRENT boot, so nothing may double-fire.
 */
export function reboot(def: ComponentDef): JanuxClient {
  return boot({ defs: [def] as never, navigation: false, webmcp: false });
}

export function pick<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);

  if (!found) throw new Error(`no element matches "${selector}"`);

  return found;
}

export function text(selector: string): string {
  return pick(selector).textContent ?? '';
}

/** Dispatches `type` on `selector` and returns the event, so a case can read `defaultPrevented`. */
export function fire(selector: string, type: string, init: EventInit = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });

  pick(selector).dispatchEvent(event);

  return event;
}

export function fireKey(selector: string, init: KeyboardEventInit): Event {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...init });

  pick(selector).dispatchEvent(event);

  return event;
}

export function fireMouse(selector: string, type: string, init: MouseEventInit = {}): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });

  pick(selector).dispatchEvent(event);

  return event;
}

/** An `input` event with the composition flag browsers set while an IME is open. */
export function type(selector: string, value: string, composing = false): void {
  const control = pick<HTMLInputElement>(selector);
  const event = new Event('input', { bubbles: true });

  control.value = value;
  Object.defineProperty(event, 'isComposing', { value: composing });
  control.dispatchEvent(event);
}

/**
 * Waits for everything the page has in flight.
 *
 * Failures are not rethrown here: an intent that throws is reported on the
 * `janux:error` channel (which cases assert), and `settled()` currently
 * rejects only when it observes the failing work before the tracker drops it —
 * a race the corpus must not encode either way.
 */
export async function settle(client: JanuxClient, scope?: string): Promise<void> {
  await client.settled(scope).catch(() => {});
}

/** Collects `janux:*` document events (audit, error, proposal, tool-call) for the duration of a case. */
export function listenDoc(type: string, onDetail: (detail: unknown) => void): () => void {
  const handler = (event: Event) => onDetail((event as CustomEvent).detail);

  document.addEventListener(type, handler);

  return () => document.removeEventListener(type, handler);
}

/** Captures `console.warn` so a case can assert the developer message a render emits. */
export function captureWarns(): { taken: () => string[] } {
  const warns: string[] = [];
  const original = console.warn;

  console.warn = (...args: unknown[]) => void warns.push(String(args[0]));

  return {
    taken: () => {
      console.warn = original;

      return warns;
    },
  };
}
