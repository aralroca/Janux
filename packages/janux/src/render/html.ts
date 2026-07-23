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

/** Maps a JSX prop to an HTML attribute pair; `on`/`intent`/`onX` become data markers for delegation. */
function propToAttr(name: string, value: unknown): [string, unknown] | undefined {
  if (name === 'children' || name === 'key' || name === 'dangerHTML') return undefined;
  if (name === 'on') return ['data-jxa', intentMarker(value)];
  if (name === 'intent') return ['data-jxform', intentMarker(value)];
  if (EVENT_ATTRS[name]) return [EVENT_ATTRS[name], intentMarker(value)];
  if (name === 'class' || name === 'className') return ['class', value];
  if (typeof value === 'function') return undefined;
  if (!VALID_ATTR_NAME.test(name)) return undefined;

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
