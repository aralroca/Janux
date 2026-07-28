import { JXE_PREFIX, markerAttrFor } from '../render/html';
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

function elementInput(el: Element): Record<string, unknown> {
  const raw = el.getAttribute('data-input');

  return raw ? JSON.parse(raw) : {};
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
function eventInput(event: Event, el: Element): Record<string, unknown> {
  const value = controlValue(el);
  const facts: Record<string, unknown> = value === undefined ? {} : { value };

  if (event instanceof KeyboardEvent) Object.assign(facts, keyboardPayload(event));
  if (event instanceof PointerEvent) Object.assign(facts, { x: event.clientX, y: event.clientY });

  return { ...facts, ...elementInput(el) };
}

async function invokeMarker(marker: string, root: Element, mount: MountContext, input?: unknown) {
  const [id = '', intentName = ''] = marker.split(':');
  const instance = await mountIsland(id, root, mount);

  return instance.intents[intentName]?.(input);
}

function formInput(form: HTMLFormElement): Record<string, unknown> {
  return Object.fromEntries(new FormData(form).entries());
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
    event.preventDefault();
    const raw = found.el.getAttribute('data-input');
    const { mount, track } = context();

    track(invokeMarker(found.marker, found.root, mount, raw ? JSON.parse(raw) : undefined));
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

    if (found && shouldCommit(found.el)) {
      track(invokeMarker(found.marker, found.root, mount, eventInput(event, found.el)));
    }
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

function listenRich(type: string): void {
  const dispatch = (event: Event) => {
    const found = markerTarget(event, `${JXE_PREFIX}${type}`);
    const { mount, track } = context();

    if (!found) return;
    if (ENTER_LEAVE.has(type) && found.el !== event.target) return;
    track(invokeMarker(found.marker, found.root, mount, eventInput(event, found.el)));
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
