import { mountIsland, type MountContext } from './mount';

/** Bubbling events delegated at the document level; focus/blur delegate via focusin/focusout. */
const DELEGATED = ['input', 'change', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'focusin', 'focusout'] as const;

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

function context(): EventContext {
  return (document as any)[CURRENT];
}

function listenClicks(): void {
  document.addEventListener('click', (event) => {
    const found = markerTarget(event, 'data-jxa');

    if (!found) return;
    event.preventDefault();
    const raw = found.el.getAttribute('data-input');
    const { mount, track } = context();

    track(invokeMarker(found.marker, found.root, mount, raw ? JSON.parse(raw) : undefined));
  });
}

function listenForms(): void {
  document.addEventListener('submit', (event) => {
    const found = markerTarget(event, 'data-jxform');

    if (!found) return;
    event.preventDefault();
    const { mount, track } = context();

    track(invokeMarker(found.marker, found.root, mount, formInput(event.target as HTMLFormElement)));
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

function listenRichEvents(): void {
  const shouldCommit = inputCommitGate();
  const commitInput = (event: Event) => {
    const found = markerTarget(event, 'data-jxe-input');
    const { mount, track } = context();

    if (found && shouldCommit(found.el)) {
      track(invokeMarker(found.marker, found.root, mount, eventInput(event, found.el)));
    }
  };

  DELEGATED.forEach((type) => {
    document.addEventListener(type, (event) => {
      if (type === 'input') {
        if (!(event as InputEvent).isComposing) commitInput(event);

        return;
      }
      const found = markerTarget(event, `data-jxe-${type}`);
      const { mount, track } = context();

      if (found) track(invokeMarker(found.marker, found.root, mount, eventInput(event, found.el)));
    });
  });
  document.addEventListener('compositionend', commitInput);
}

/** Installs every delegated listener: click/submit (v0) plus the rich-event marker family. */
export function listen(mount: MountContext, track: Track): void {
  const doc = document as any;

  doc[CURRENT] = { mount, track } satisfies EventContext;
  if (doc[INSTALLED]) return;
  doc[INSTALLED] = true;
  listenClicks();
  listenForms();
  listenRichEvents();
}

export { invokeMarker, markerTarget };
