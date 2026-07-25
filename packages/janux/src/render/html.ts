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

/** Rich events: each becomes a delegated `data-jxe-*` marker (resumability intact). */
export const EVENT_ATTRS: Record<string, string> = {
  onInput: 'data-jxe-input',
  onChange: 'data-jxe-change',
  onKeyDown: 'data-jxe-keydown',
  onKeyUp: 'data-jxe-keyup',
  onFocus: 'data-jxe-focusin',
  onBlur: 'data-jxe-focusout',
  onPointerDown: 'data-jxe-pointerdown',
  onPointerUp: 'data-jxe-pointerup',
};

/** Attributes whose value the browser resolves as a URL, so its scheme executes. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data', 'ping', 'background']);
const SCHEME_NOISE = /[\u0000-\u0020]/g;
const EXECUTABLE_SCHEME = /^(?:javascript|vbscript|livescript|mocha):/;
/** `data:` is only dangerous for types the browser parses as a document. */
const EXECUTABLE_DATA = /^data:(?:text\/html|text\/xml|image\/svg\+xml|application\/xhtml\+xml|application\/xml)/;

/**
 * The longest thing either pattern can match is `data:application/xhtml+xml`, so
 * only the head of the value can decide. Normalizing the whole string would copy
 * it twice — 107µs and ~400KB of garbage per render for an inline `data:` image,
 * on a path that runs for every attribute of every element.
 */
const SCHEME_WINDOW = 64;

/**
 * Whether following this URL would run script.
 *
 * The browser strips control characters and ASCII whitespace before parsing the
 * scheme and compares it case-insensitively, so `JaVaScRiPt:`, `java\tscript:`
 * and a leading NUL all execute. Normalize the same way before deciding.
 */
function isExecutableUrl(value: string): boolean {
  const head = value.slice(0, SCHEME_WINDOW).replace(SCHEME_NOISE, '').toLowerCase();

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

/** Maps a JSX prop to an HTML attribute pair; `on`/`intent`/`onX` become data markers for delegation. */
function propToAttr(name: string, value: unknown): [string, unknown] | undefined {
  if (name === 'children' || name === 'key' || name === 'dangerHTML') return undefined;
  if (name === 'on') return ['data-jxa', intentMarker(value)];
  if (name === 'intent') return ['data-jxform', intentMarker(value)];
  if (EVENT_ATTRS[name]) return [EVENT_ATTRS[name], intentMarker(value)];
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

export function attrEntries(props: Record<string, unknown>): [string, unknown][] {
  return Object.entries(props)
    .map(([name, value]) => propToAttr(name, value))
    .filter((entry): entry is [string, unknown] => entry !== undefined);
}

export function renderAttrs(props: Record<string, unknown>): string {
  return attrEntries(props)
    .map(([name, value]) => attrFor(name, value))
    .join('');
}
