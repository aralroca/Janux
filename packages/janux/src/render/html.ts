export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"]/g, (char) => ESCAPES[char]!);
}

/** Explicit island keys must survive marker parsing (`:`), selectors (`"`) and id parsing (`#`). */
export function safeKey(explicit: unknown): string {
  return String(explicit).replace(/[^\w.-]/g, '_');
}

/** Deterministic collision dedupe for sibling islands sharing an explicit key. */
export function dedupeKey(key: string, used: Set<string>): string {
  let candidate = key;
  let n = 2;

  while (used.has(candidate)) candidate = `${key}~${n++}`;
  if (candidate !== key) console.warn(`Janux: duplicate island key "${key}" — using "${candidate}"`);
  used.add(candidate);

  return candidate;
}

function intentMarker(value: unknown): string | undefined {
  const meta = (value as any)?.$intent;

  if (!meta) return undefined;
  const key = meta.key ? `#${meta.key}` : '';

  return `${meta.component}${key}:${meta.name}`;
}

function attrFor(name: string, value: unknown): string {
  if (value === false || value === null || value === undefined) return '';
  if (value === true) return ` ${name}`;

  return ` ${name}="${escapeHtml(value)}"`;
}

const VALID_ATTR_NAME = /^[a-zA-Z][\w-]*$/;
const CUSTOM_PROPERTY = /^--/;
const UPPER = /[A-Z]/g;

function isStyleObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `backgroundColor` → `background-color`; a custom property keeps its casing. */
function cssName(prop: string): string {
  return CUSTOM_PROPERTY.test(prop) ? prop : prop.replace(UPPER, (char) => `-${char.toLowerCase()}`);
}

/**
 * A style object becomes CSS text, because JSX invites `style={{…}}` and
 * `[object Object]` is the worst possible answer to it.
 *
 * Unlike React, a bare number is never given a unit: `{ width: 10 }` renders
 * `width:10`, not `width:10px`. The guess is wrong for `lineHeight`, `flex`,
 * `zIndex`, `opacity` and every unitless property, so Janux asks for the unit
 * instead of maintaining a list of exceptions.
 */
function styleText(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([, part]) => part !== null && part !== undefined && part !== false && part !== '')
    .map(([prop, part]) => `${cssName(prop)}:${part}`)
    .join(';');
}

/** A JSX event prop: `on` + an uppercase letter (so `once`/`online` are not events). */
const EVENT_PROP = /^on[A-Z]/;
/** Anything the browser could read back as an inline handler attribute (`onclick="…"`). */
const ON_PREFIX = /^on/i;
/**
 * JSX prop → DOM event where `slice(2).toLowerCase()` is not enough. Both the
 * React (`onDoubleClick`) and the Preact/Brisa (`onDblClick`) spelling land on
 * `dblclick`; focus/blur delegate via their bubbling variants.
 */
const EVENT_EXCEPTIONS: Record<string, string> = {
  doubleclick: 'dblclick',
  focus: 'focusin',
  blur: 'focusout',
};
/** Derived names must be safe inside an attribute name — anything else is refused. */
const EVENT_NAME = /^[a-z]+$/;

/** `onDoubleClick` → `dblclick`; undefined when the prop is not an event binding. */
export function eventNameFor(prop: string): string | undefined {
  if (!EVENT_PROP.test(prop)) return undefined;
  const raw = prop.slice(2).toLowerCase();
  const name = EVENT_EXCEPTIONS[raw] ?? raw;

  return EVENT_NAME.test(name) ? name : undefined;
}

/** The one place the marker wire format lives: v0 names for click/submit, `data-jxe-*` for the rest. */
export const JXE_PREFIX = 'data-jxe-';

/** click and submit keep their v0 markers; every other event gets a `data-jxe-*` one. */
export function markerAttrFor(event: string): string {
  if (event === 'click') return 'data-jxa';
  if (event === 'submit') return 'data-jxform';

  return `${JXE_PREFIX}${event}`;
}

/** Whether an attribute name is one of the delegation markers `markerAttrFor` can emit. */
export function isMarkerAttr(name: string): boolean {
  return name === 'data-jxa' || name === 'data-jxform' || name.startsWith(JXE_PREFIX);
}

/** Attributes whose value the browser resolves as a URL, so its scheme executes. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data', 'ping', 'background']);
const SCHEME_NOISE = /[\u0000-\u0020]/g;
const EXECUTABLE_SCHEME = /^(?:javascript|vbscript|livescript|mocha):/;
/** `data:` is only dangerous for types the browser parses as a document. */
const EXECUTABLE_DATA = /^data:(?:text\/html|text\/xml|image\/svg\+xml|application\/xhtml\+xml|application\/xml)/;

/** `data:application/xhtml+xml` is the longest thing either pattern can match. */
const MEANINGFUL_HEAD = 48;

/**
 * The head of the value, lowercased, with the characters browsers ignore removed.
 *
 * Counts only *meaningful* characters instead of slicing a fixed window first.
 * Slicing first is a bypass: `'java' + '\t'.repeat(60) + 'script:alert(1)'` pushes
 * the colon past any fixed offset, and the browser strips those tabs and runs it
 * anyway. Scanning also avoids copying the value — for a 200KB inline `data:`
 * image it stops after 48 characters instead of allocating two full copies
 * (107µs and ~400KB of garbage per render, on a path that runs for every
 * attribute of every element).
 */
function meaningfulHead(value: string): string {
  let head = '';

  for (let index = 0; index < value.length && head.length < MEANINGFUL_HEAD; index += 1) {
    if (value.charCodeAt(index) > 0x20) head += value[index];
  }

  return head.toLowerCase();
}

/**
 * Whether following this URL would run script. Browsers ignore control characters
 * and ASCII whitespace when parsing a scheme and compare it case-insensitively,
 * so `JaVaScRiPt:`, `java\tscript:` and a leading NUL all execute.
 */
function isExecutableUrl(value: string): boolean {
  const head = meaningfulHead(value);

  return EXECUTABLE_SCHEME.test(head) || EXECUTABLE_DATA.test(head);
}

/**
 * Entity-escaping does nothing to a scheme, so these are dropped instead. Janux
 * is agent-native: a tool call can put a value into state that a human later
 * clicks, and guards gate which intent may run rather than what the value it
 * stores says — so the render is the only place this can be stopped.
 *
 * `typeof` is tested before the Set so an ordinary boolean or numeric attribute
 * fails out without allocating a lowercased copy of its name.
 */
function isBlockedUrl(name: string, value: unknown): value is string {
  return typeof value === 'string' && URL_ATTRS.has(name.toLowerCase()) && isExecutableUrl(value);
}

/** Maps a JSX prop to an HTML attribute pair; `onX={intents.y}` becomes a data marker for delegation. */
function propToAttr(name: string, value: unknown): [string, unknown] | undefined {
  if (name === 'children' || name === 'key' || name === 'dangerHTML') return undefined;
  if (name === 'on' || name === 'intent') {
    if ((value as any)?.$intent) {
      console.warn(`Janux: "${name}" was removed — bind the event by name instead: onClick, onSubmit, …`);
    }

    return undefined;
  }
  // `<form onSubmit reset>`: the runtime empties the form once the intent has
  // the values, which state can't do — a controlled write is skipped while the
  // control is focused, and submitting with Enter never moves focus.
  if (name === 'reset') return value === true ? ['data-jxreset', ''] : undefined;
  const event = eventNameFor(name);

  if (event && (value as any)?.$intent) return [markerAttrFor(event), intentMarker(value)];
  // The whole `on*` namespace is reserved: what isn't a bound intent must not
  // reach the markup, where the browser would read it back as an inline
  // handler attribute (`onclick="…"` executes its value).
  if (ON_PREFIX.test(name)) {
    if (typeof value === 'function') {
      console.warn(`Janux: "${name}" expects a named intent — a plain function has no name, schema or guard, so it was dropped`);
    }

    return undefined;
  }
  if (name === 'class' || name === 'className') return ['class', value];
  // An empty style object must leave no attribute behind, so `undefined` here.
  if (name === 'style' && isStyleObject(value)) return ['style', styleText(value) || undefined];
  if (typeof value === 'function') return undefined;
  if (!VALID_ATTR_NAME.test(name)) return undefined;
  if (isBlockedUrl(name, value)) {
    console.warn(`Janux: blocked an executable URL in "${name}" — ${value.slice(0, 40)}`);

    return undefined;
  }

  return [name, value];
}

/** The input a `.with()`-bound event prop carries, when `name` is an event prop at all. */
function boundInputOf(name: string, value: unknown): Record<string, unknown> | undefined {
  const ref = value as { $intent?: unknown; $input?: Record<string, unknown> } | null;

  // Cheapest test first: almost no prop on a plain element carries $intent.
  return ref?.$intent && ref.$input && eventNameFor(name) ? ref.$input : undefined;
}

/**
 * The `data-input` the element's `.with()` bindings ask for — unless it
 * declares its own, which wins (and makes the binding pointless, so dev hears
 * about it). Serialization failures drop only the input, never the marker.
 */
function boundInputAttr(bound: [string, Record<string, unknown>][], explicit: unknown): [string, unknown] | undefined {
  if (bound.length === 0) return undefined;
  const [[name, input]] = bound as [[string, Record<string, unknown>]];

  if (bound.length > 1) console.warn(`Janux: several .with() bindings on one element — "${name}" wins, data-input is per element`);
  if (explicit !== undefined) {
    console.warn(`Janux: an explicit data-input wins over the .with() binding on "${name}"`);

    return undefined;
  }
  try {
    const json = JSON.stringify(input);

    // `JSON.stringify` can also fail by RETURNING undefined (toJSON tricks).
    if (typeof json === 'string') return ['data-input', json];
  } catch {
    // fall through to the shared warning
  }
  console.warn(`Janux: the .with() input on "${name}" is not JSON-serializable — dropped`);

  return undefined;
}

/**
 * Alias spellings can collide on one marker (`onFocus`+`onFocusIn`,
 * `onDoubleClick`+`onDblClick`): the first prop wins — a duplicate attribute
 * would be invalid HTML the browser resolves the same way, silently.
 */
function dedupeMarkers(entries: [string, unknown][]): [string, unknown][] {
  const seen = new Set<string>();

  return entries.filter(([name]) => {
    if (!isMarkerAttr(name)) return true;
    if (seen.has(name)) {
      console.warn(`Janux: two event props resolve to the same marker "${name}" — the first one wins`);

      return false;
    }
    seen.add(name);

    return true;
  });
}

export function attrEntries(props: Record<string, unknown>): [string, unknown][] {
  const pairs = Object.entries(props);
  const entries = dedupeMarkers(
    pairs
      .map(([name, value]) => propToAttr(name, value))
      .filter((entry): entry is [string, unknown] => entry !== undefined),
  );
  const bound = pairs.flatMap(([name, value]) => {
    const input = boundInputOf(name, value);

    return input ? [[name, input] as [string, Record<string, unknown>]] : [];
  });
  const extra = boundInputAttr(bound, props['data-input']);

  return extra ? [...entries, extra] : entries;
}

export function renderAttrs(props: Record<string, unknown>): string {
  return attrEntries(props)
    .map(([name, value]) => attrFor(name, value))
    .join('');
}
