import { JXE_PREFIX, markerAttrFor } from '../render/html';
import type { JanuxInstance } from '../runtime/instance';
import { mountIsland, type MountContext } from './mount';

interface MarkerHit {
  marker: string;
  root: Element;
  el: Element;
}

function markerTarget(event: Event, attr: string): MarkerHit | undefined {
  const el = (event.target as Element | null)?.closest?.(`[${attr}]`);
  const root = el?.closest('janux-island[data-jx]');

  if (!el || !root) return undefined;

  return { marker: el.getAttribute(attr)!, root, el };
}

function reportEventError(message: string): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: `Janux: ${message}` }));
}

/**
 * A `data-input` that is not JSON. Refusing the invocation is the fail-closed
 * answer: running the intent without the input the markup declared would put a
 * mutation through with the wrong arguments, and letting `JSON.parse` throw out
 * of a document-level listener took the whole delegation pass down with it —
 * every other marker of that dispatch included.
 */
const INVALID_INPUT = Symbol.for('janux.invalidInput');

type ElementInput = Record<string, unknown> | undefined | typeof INVALID_INPUT;

/** The element's own `data-input`: `undefined` when absent, `INVALID_INPUT` when unparseable. */
function elementInput(el: Element): ElementInput {
  const raw = el.getAttribute('data-input');

  // Absent and empty are the same thing — "this element declares no input" —
  // and only a non-empty value that fails to parse is a broken declaration.
  if (raw === null || raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    reportEventError(`ignored an event — "data-input" on <${el.tagName.toLowerCase()}> is not valid JSON`);

    return INVALID_INPUT;
  }
}

function controlValue(el: Element): unknown {
  if (el instanceof HTMLInputElement) {
    return el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;

  return undefined;
}

function keyboardPayload(event: KeyboardEvent): Record<string, unknown> {
  const { key, code, altKey, ctrlKey, metaKey, shiftKey } = event;

  return { key, code, altKey, ctrlKey, metaKey, shiftKey };
}

/** Intent input derived from the event: `data-input` wins, then value/key/pointer facts. */
function eventInput(event: Event, el: Element): Record<string, unknown> | typeof INVALID_INPUT {
  const bound = elementInput(el);

  if (bound === INVALID_INPUT) return INVALID_INPUT;
  const value = controlValue(el);
  const facts: Record<string, unknown> = value === undefined ? {} : { value };

  if (event instanceof KeyboardEvent) Object.assign(facts, keyboardPayload(event));
  // The whole mouse family (pointer, drag, dblclick…) reports where it happened.
  if (event instanceof MouseEvent) Object.assign(facts, { x: event.clientX, y: event.clientY });

  return { ...facts, ...bound };
}

/**
 * Events the platform never dispatches on a disabled form control, so a
 * delegated listener must not either: a programmatic `.click()` — an agent's
 * DOM fallback, a test, a userscript — is otherwise a way around a UI that
 * says the action is unavailable, and the intent would run.
 *
 * Ported from React's `shouldPreventMouseEvent` (react-dom, DOMPluginEventSystem),
 * extended to the pointer trio the HTML spec suppresses the same way.
 */
const DISABLEABLE_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'pointerdown',
  'pointerup',
  'pointermove',
]);
/** `fieldset[disabled]` counts: it disables every control inside it. */
const DISABLED_CONTROL = 'button[disabled],input[disabled],select[disabled],textarea[disabled],fieldset[disabled]';

function suppressedByDisabled(type: string, hit: MarkerHit, target: EventTarget | null): boolean {
  if (!DISABLEABLE_EVENTS.has(type)) return false;
  if (hit.el.matches(DISABLED_CONTROL)) return true;

  return target instanceof Element && !!target.closest(DISABLED_CONTROL);
}

/**
 * Not `async`: an island that is already mounted — every event after the first
 * — would otherwise pay two microtask hops and a wrapper promise to `await` a
 * `Promise.resolve()`, once per event. A burst of a few hundred makes that
 * visible, and the intent's own promise is the one the caller wants anyway.
 */
function invokeMarker(marker: string, root: Element, mount: MountContext, input?: unknown): Promise<unknown> {
  const [id = '', intentName = ''] = marker.split(':');
  const run = (instance: JanuxInstance) => instance.intents[intentName]?.(input);
  const mounted = mount.registry.mounted.get(id);

  if (mounted) return Promise.resolve(run(mounted));

  return mountIsland(id, root, mount).then(run);
}

function formInput(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);

  // getAll: repeated names (multi-select, checkbox groups) must arrive as a
  // list — fromEntries would keep only the last value.
  return Object.fromEntries(
    [...new Set(data.keys())].map((key) => {
      const values = data.getAll(key);

      return [key, values.length > 1 ? values : values[0]];
    }),
  );
}

type Track = (work: Promise<unknown>) => void;

interface EventContext {
  mount: MountContext;
  track: Track;
}

/** Listeners install once per document and dispatch to the CURRENT boot context (re-boot/HMR safe). */
const CURRENT = Symbol.for('janux.eventContext');
const INSTALLED = Symbol.for('janux.eventsInstalled');
const RICH = Symbol.for('janux.richListeners');

/** Event types whose delegated listener is already installed on this document. */
function richListeners(): Set<string> {
  const doc = document as any;

  return (doc[RICH] ??= new Set<string>());
}

function context(): EventContext {
  return (document as any)[CURRENT];
}

function listenClicks(): void {
  document.addEventListener('click', (event) => {
    const found = markerTarget(event, markerAttrFor('click'));

    if (!found) return;
    if (suppressedByDisabled('click', found, event.target)) return;
    // Prevented even when the input turns out to be unusable: the marker
    // declares this element as intent-driven, so its platform default (a link
    // navigating, a submit button posting) must not fire behind the refusal.
    event.preventDefault();
    const input = elementInput(found.el);

    if (input === INVALID_INPUT) return;
    const { mount, track } = context();

    track(invokeMarker(found.marker, found.root, mount, input));
  });
}

function listenForms(): void {
  document.addEventListener('submit', (event) => {
    const found = markerTarget(event, markerAttrFor('submit'));

    if (!found) return;
    event.preventDefault();
    const { mount, track } = context();
    const form = event.target as HTMLFormElement;
    const input = formInput(form);

    track(invokeMarker(found.marker, found.root, mount, input));
    // The values are already captured, so resetting can't race the intent.
    if (form.hasAttribute('data-jxreset')) form.reset();
  });
}

/**
 * IME guard: composition keystrokes are suppressed and the composed text
 * commits once. Browsers disagree on the compositionend/input order (WebKit
 * fires both), so commits are deduped by the control's last-dispatched value.
 */
function inputCommitGate(): (el: Element) => boolean {
  const committed = new WeakMap<Element, unknown>();

  return (el) => {
    const value = controlValue(el);

    if (committed.get(el) === value) return false;
    committed.set(el, value);

    return true;
  };
}

/** `input` is special: composition keystrokes hold back, `compositionend` commits once. */
function listenInput(): void {
  const shouldCommit = inputCommitGate();
  const commitInput = (event: Event) => {
    const found = markerTarget(event, `${JXE_PREFIX}input`);
    const { mount, track } = context();

    if (!found || !shouldCommit(found.el)) return;
    const input = eventInput(event, found.el);

    if (input !== INVALID_INPUT) track(invokeMarker(found.marker, found.root, mount, input));
  };

  document.addEventListener('input', (event) => {
    if (!(event as InputEvent).isComposing) commitInput(event);
  });
  document.addEventListener('compositionend', commitInput);
}

/**
 * Enter/leave events dispatch once PER element of the entered/left chain, so
 * the marker must be the dispatch target itself: resolving via `closest` would
 * also fire on every internal boundary crossing (moving between the marked
 * element's own children) and double-fire on a single entry.
 */
const ENTER_LEAVE = new Set(['mouseenter', 'mouseleave', 'pointerenter', 'pointerleave']);

/**
 * The platform only fires `drop` on an element whose `dragover` was
 * preventDefault'd. The `data-jxe-drop` marker already declares the zone, so
 * binding `onDrop` is all a view does — the runtime does the enabling here
 * (capture phase: enabling a declared zone must not depend on page code).
 */
function enableDropZones(): void {
  document.addEventListener(
    'dragover',
    (event) => {
      if ((event.target as Element | null)?.closest?.(`[${JXE_PREFIX}drop]`)) event.preventDefault();
    },
    true,
  );
}

function listenRich(type: string): void {
  if (type === 'drop') enableDropZones();
  const dispatch = (event: Event) => {
    const found = markerTarget(event, `${JXE_PREFIX}${type}`);
    const { mount, track } = context();

    if (!found) return;
    if (ENTER_LEAVE.has(type) && found.el !== event.target) return;
    if (suppressedByDisabled(type, found, event.target)) return;
    // A handled drop must also cancel the browser default (navigating to a
    // dragged link or opening a dropped file over the page).
    if (type === 'drop') event.preventDefault();
    const input = eventInput(event, found.el);

    if (input !== INVALID_INPUT) track(invokeMarker(found.marker, found.root, mount, input));
  };

  // Bubbling events delegate in the bubble phase, so component code (e.g. an
  // embedded foreign editor) can still suppress them with stopPropagation().
  // Non-bubbling events can only be seen in the capture phase, which visits
  // every ancestor of the target regardless — each event picks its lane by its
  // own `bubbles` flag, so no curated list can drift.
  document.addEventListener(type, (event) => {
    if (!event.bubbles) dispatch(event);
  }, true);
  document.addEventListener(type, (event) => {
    if (event.bubbles) dispatch(event);
  });
}

/**
 * Installs the delegated listener for one event type, once per document. Events
 * are open-ended (`onWheel`, `onDoubleClick`, …): a listener exists only for the
 * types whose marker has actually been seen — in the SSR HTML at boot or after a
 * navigation (`scanMarkers`), or the moment a client render creates one
 * (`setAttr` in dom.ts).
 */
export function ensureListener(type: string): void {
  const installed = richListeners();

  if (installed.has(type)) return;
  installed.add(type);
  if (type === 'input') return listenInput();
  listenRich(type);
}

/** `ensureListener`, keyed by the marker attribute a renderer just wrote (no-op for other attributes). */
export function ensureListenerForAttr(name: string): void {
  if (name.startsWith(JXE_PREFIX)) ensureListener(name.slice(JXE_PREFIX.length));
}

function ensureElementListeners(el: Element): void {
  for (let index = 0; index < el.attributes.length; index += 1) {
    ensureListenerForAttr(el.attributes[index]!.name);
  }
}

/** Discovers the event types the document's islands bind, so their listeners exist before first interaction. */
export function scanMarkers(root: ParentNode): void {
  root.querySelectorAll('janux-island *').forEach(ensureElementListeners);
}

/**
 * Same discovery for one just-inserted subtree — the streamed navigation diff
 * writes elements chunk by chunk, and a marker must be listenable the moment it
 * paints, not when the stream ends.
 */
export function scanTree(root: Element): void {
  ensureElementListeners(root);
  root.querySelectorAll('*').forEach(ensureElementListeners);
}

/** Installs the delegated listeners: click/submit always, the open event family on sight. */
export function listen(mount: MountContext, track: Track): void {
  const doc = document as any;

  doc[CURRENT] = { mount, track } satisfies EventContext;
  scanMarkers(document);
  if (doc[INSTALLED]) return;
  doc[INSTALLED] = true;
  listenClicks();
  listenForms();
}

export { invokeMarker, markerTarget };
