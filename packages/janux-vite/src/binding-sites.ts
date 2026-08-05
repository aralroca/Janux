import { MODULE_PATH, unwrap } from './islands';
import { parseWithSpanBase, splice, type Span } from './spans';

/**
 * Compile-time binding maps (the roadmap's compiler evolution, first half).
 *
 * A JSX site that is a pure static read of a schema-typed state path is
 * rewritten into a reactive binding thunk — `{state.count}` becomes
 * `{() => (state.count)}` — which is the exact shape the client runtime
 * already gives its own per-slot effect (`textBindingTarget`, `bindProps`)
 * and the server already resolves inline. The view stops subscribing to the
 * read, so a write re-runs one DOM write instead of one island render.
 *
 * The transform must be invisible: every rewrite has to be PROVABLY
 * equivalent to what the untouched view renders, so anything the analysis
 * cannot prove is left exactly as written, site by site — and any surprise
 * (unparseable module, spans that stopped lining up) fails open to "no
 * transform" rather than open the build to a miscompile.
 */

/**
 * What the schema proves about one path. Text position is the strict case:
 * JSX drops null/undefined/boolean where `textOf` renders them, so only a
 * non-nullable string/number leaf is equivalent as text (`text`). Attribute
 * position is lax: absent-for-falsy and the aria stringification treat a
 * static value and a resolved thunk identically, so any leaf qualifies
 * (`attr`). `props` carries an `obj()`'s resolved shape; a leaf (or
 * anything unresolvable) has none.
 */
interface PathType {
  text: boolean;
  attr: boolean;
  props?: Map<string, PathType>;
  item?: PathType;
}

const OPAQUE: PathType = { text: false, attr: false };

/** The builders whose value always renders the same as text, thunked or not. */
const TEXT_SAFE_BUILDERS = new Set(['str', 'int', 'num', 'money', 'enums']);

/** Every scalar builder: provable in attribute position whatever its modifiers. */
const LEAF_BUILDERS = new Set([...TEXT_SAFE_BUILDERS, 'bool']);

/** Chained modifiers that reintroduce null/undefined into a leaf. */
const UNSAFE_MODIFIERS = new Set(['optional', 'nullable']);

/**
 * Attributes a binding must not own: events delegate to named intents, and
 * the rest are the props `propToAttr` treats specially. `value`/`checked`
 * are NOT here — a bound control property and a static one share the same
 * write path and the same skip-while-focused rule (`writeControlProp` /
 * `syncControl`).
 */
const BLOCKED_ATTRS = new Set(['key', 'children', 'dangerHTML', 'reset', 'on', 'intent', 'data-input']);
const EVENT_PROP = /^on[A-Z]/;

/** Local names this module imported from 'janux', mapped to their exported names. */
export function januxImports(body: any[]): Map<string, string> {
  const names = new Map<string, string>();

  body
    .filter((node) => node.type === 'ImportDeclaration' && node.source?.value === 'janux')
    .flatMap((node) => node.specifiers ?? [])
    .forEach((spec: any) => {
      if (spec.type !== 'ImportSpecifier') return;
      names.set(spec.local.value, spec.imported?.value ?? spec.local.value);
    });

  return names;
}

/** The trusted janux export a call invokes, if the callee is one at all. */
export function calleeExport(node: any, trusted: Map<string, string>): string | undefined {
  return node?.type === 'CallExpression' && node.callee?.type === 'Identifier'
    ? trusted.get(node.callee.value)
    : undefined;
}

/**
 * Peels `.default(…)`/`.min(…)`/… off a builder chain down to the base call,
 * remembering whether any modifier reintroduced null/undefined.
 */
function baseBuilder(node: any): { base: any; unsafe: boolean } {
  let current = unwrap(node);
  let unsafe = false;

  while (current?.type === 'CallExpression' && current.callee?.type === 'MemberExpression') {
    const method = current.callee.property;

    if (method?.type === 'Identifier' && UNSAFE_MODIFIERS.has(method.value)) unsafe = true;
    current = unwrap(current.callee.object);
  }

  return { base: current, unsafe };
}

/** Resolves one schema builder expression into what it proves about the path. */
function typeOf(node: any, trusted: Map<string, string>): PathType {
  const { base, unsafe } = baseBuilder(node);
  const exported = calleeExport(base, trusted);

  if (exported === undefined) return OPAQUE;
  if (LEAF_BUILDERS.has(exported)) return { text: TEXT_SAFE_BUILDERS.has(exported) && !unsafe, attr: true };
  if ((exported === 'obj' || exported === 'schema') && !unsafe) {
    const props = shapeOf(base.arguments?.[0]?.expression, trusted);

    return props ? { text: false, attr: false, props } : OPAQUE;
  }
  if (exported === 'list' && !unsafe) {
    // `list(str())` or `list({ shape })` — the latter is an implicit obj().
    const arg = unwrap(base.arguments?.[0]?.expression);
    const item = arg?.type === 'ObjectExpression' ? shapeOf(arg, trusted) : undefined;

    return { text: false, attr: false, item: item ? { text: false, attr: false, props: item } : typeOf(arg, trusted) };
  }

  return OPAQUE;
}

/** An object shape, when every property of it is statically written. */
function shapeOf(node: any, trusted: Map<string, string>): Map<string, PathType> | undefined {
  const shape = unwrap(node);

  if (shape?.type !== 'ObjectExpression') return undefined;
  const props = new Map<string, PathType>();

  for (const prop of shape.properties ?? []) {
    if (prop.type !== 'KeyValueProperty') return undefined;
    const key = prop.key;
    const name = key?.type === 'Identifier' || key?.type === 'StringLiteral' ? key.value : undefined;

    if (name === undefined) return undefined;
    props.set(name, typeOf(prop.value, trusted));
  }

  return props;
}

/**
 * One step of a member chain. A `prop` resolves through an `obj()` shape, an
 * `index` (numeric literal or computed identifier) through a `list()` item.
 * A computed identifier defers to effect time, so its name must be provably
 * stable — the site is dropped if anything in the module reassigns it.
 */
interface Segment {
  name: string;
  index: boolean;
}

interface StatePath {
  segments: Segment[];
  /** Identifier names the site evaluation was deferred over. */
  idents: string[];
}

/** The `state.a.b[i]` chain of a pure static member expression, root excluded — or undefined. */
function statePath(expr: any): StatePath | undefined {
  const segments: Segment[] = [];
  const idents: string[] = [];
  let current = unwrap(expr);

  while (current?.type === 'MemberExpression') {
    const prop = current.property;

    if (prop?.type === 'Identifier') segments.unshift({ name: prop.value, index: false });
    else if (prop?.type === 'Computed') {
      const key = unwrap(prop.expression);

      if (key?.type === 'StringLiteral') segments.unshift({ name: key.value, index: false });
      else if (key?.type === 'NumericLiteral') segments.unshift({ name: String(key.value), index: true });
      else if (key?.type === 'Identifier') {
        segments.unshift({ name: key.value, index: true });
        idents.push(key.value);
      } else return undefined;
    } else return undefined;
    current = unwrap(current.object);
  }

  return current?.type === 'Identifier' && current.value === 'state' && segments.length > 0
    ? { segments, idents }
    : undefined;
}

/** Whether the schema proves this path equivalent when thunked at this position. */
function pathIsSafe(path: StatePath, shape: Map<string, PathType>, position: 'text' | 'attr'): boolean {
  let type: PathType | undefined = { text: false, attr: false, props: shape };

  for (const segment of path.segments) {
    type = segment.index ? type.item : type.props?.get(segment.name);
    if (type === undefined) return false;
  }

  return type[position];
}

/**
 * Names the module gives no stable meaning: reassigned, ++/--'d, or
 * `var`-declared (one binding across loop iterations — the classic capture
 * bug a deferred read would inherit). Parameters and const/let bindings that
 * are never written again are what remains.
 */
function taintedNames(node: any, out: Set<string>): Set<string> {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => taintedNames(child, out));

    return out;
  }
  if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier') out.add(node.left.value);
  if (node.type === 'UpdateExpression' && node.argument?.type === 'Identifier') out.add(node.argument.value);
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    node.declarations?.forEach((decl: any) => {
      if (decl.id?.type === 'Identifier') out.add(decl.id.value);
    });
  }
  Object.values(node).forEach((value) => taintedNames(value, out));

  return out;
}

/** Whether this pattern binds the name (so the view's `state` is shadowed past it). */
function patternBinds(pattern: any, name: string): boolean {
  if (!pattern || typeof pattern !== 'object') return false;
  switch (pattern.type) {
    case 'Identifier':
      return pattern.value === name;
    case 'ObjectPattern':
      return (pattern.properties ?? []).some((prop: any) =>
        prop.type === 'AssignmentPatternProperty'
          ? prop.key?.value === name
          : prop.type === 'KeyValuePatternProperty'
            ? patternBinds(prop.value, name)
            : patternBinds(prop.argument, name),
      );
    case 'ArrayPattern':
      return (pattern.elements ?? []).some((el: any) => patternBinds(el, name));
    case 'AssignmentPattern':
      return patternBinds(pattern.left, name);
    case 'RestElement':
      return patternBinds(pattern.argument, name);
    default:
      return false;
  }
}

/** Any binding of `state` anywhere under the view makes every read ambiguous — bail. */
function shadowsState(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => shadowsState(child));
  if (node.type === 'VariableDeclarator' && patternBinds(node.id, 'state')) return true;
  if (node.type === 'CatchClause' && patternBinds(node.param, 'state')) return true;
  if (node.type === 'ArrowFunctionExpression' && (node.params ?? []).some((p: any) => patternBinds(p, 'state'))) return true;
  if (
    (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') &&
    (node.params ?? []).some((p: any) => patternBinds(p.pat, 'state'))
  ) {
    return true;
  }

  return Object.values(node).some((value) => shadowsState(value));
}

/**
 * JSX drops text that is pure whitespace containing a newline; everything
 * else in a child position can render. A `{/* comment *​/}` container is an
 * empty expression and renders nothing either.
 */
function rendersText(child: any): boolean {
  if (child.type === 'JSXText') return !(/^\s*$/.test(child.value) && child.value.includes('\n'));
  if (child.type === 'JSXExpressionContainer') return child.expression?.type !== 'JSXEmptyExpression';

  return child.type === 'JSXFragment';
}

interface Site {
  span: Span;
  idents: string[];
}

interface ViewAnalysis {
  shape: Map<string, PathType>;
  sites: Site[];
}

/**
 * Walks the view's JSX collecting provable sites, map callbacks included (a
 * thunk in a map body closes over that iteration's bindings, exactly like a
 * manual one). A component's children are its data, so its subtree is out.
 */
function collectSites(node: any, view: ViewAnalysis): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => collectSites(child, view));

    return;
  }
  if (node.type === 'JSXElement') {
    const name = node.opening?.name;
    const native = name?.type === 'Identifier' && /^[a-z]/.test(name.value);

    if (!native) return;
    (node.opening.attributes ?? []).forEach((attr: any) => {
      if (attr.type !== 'JSXAttribute' || attr.name?.type !== 'Identifier') return;
      if (EVENT_PROP.test(attr.name.value) || BLOCKED_ATTRS.has(attr.name.value)) return;
      if (attr.value?.type !== 'JSXExpressionContainer') return;
      const path = statePath(attr.value.expression);

      if (path && pathIsSafe(path, view.shape, 'attr')) {
        view.sites.push({ span: attr.value.expression.span, idents: path.idents });
      }
    });
    node.children?.forEach((child: any) => {
      if (child.type !== 'JSXExpressionContainer') return collectSites(child, view);
      const path = statePath(child.expression);
      const siblings = node.children.filter((other: any) => other !== child);

      if (path && pathIsSafe(path, view.shape, 'text') && !siblings.some(rendersText)) {
        view.sites.push({ span: child.expression.span, idents: path.idents });
      } else {
        collectSites(child.expression, view);
      }
    });

    return;
  }
  Object.values(node).forEach((value) => collectSites(value, view));
}

/** The `view` arrow of one component def, when its bag destructures a plain `state`. */
function viewArrow(config: any): any {
  const view = (config.properties ?? []).find(
    (prop: any) => prop.type === 'KeyValueProperty' && prop.key?.value === 'view',
  );
  const arrow = view ? unwrap(view.value) : undefined;

  if (arrow?.type !== 'ArrowFunctionExpression') return undefined;
  const bag = arrow.params?.[0];
  const takesState =
    bag?.type === 'ObjectPattern' &&
    (bag.properties ?? []).some((prop: any) => prop.type === 'AssignmentPatternProperty' && prop.key?.value === 'state');

  return takesState ? arrow : undefined;
}

/** The resolved state schema shape of one component def, when statically written. */
function stateShape(config: any, trusted: Map<string, string>): Map<string, PathType> | undefined {
  const state = (config.properties ?? []).find(
    (prop: any) => prop.type === 'KeyValueProperty' && prop.key?.value === 'state',
  );
  const call = state ? unwrap(state.value) : undefined;

  return calleeExport(call, trusted) === 'schema' ? shapeOf(call.arguments?.[0]?.expression, trusted) : undefined;
}

/** Every `component({...})` config object a module declares at top level. */
export function componentConfigs(body: any[], trusted: Map<string, string>): any[] {
  if (trusted.get('component') !== 'component') return [];

  return body.flatMap((node) => {
    const decls =
      node.type === 'ExportDefaultExpression'
        ? [node.expression]
        : ((node.type === 'ExportDeclaration' ? node.declaration : node)?.type === 'VariableDeclaration'
            ? (node.type === 'ExportDeclaration' ? node.declaration : node).declarations.map((d: any) => d.init)
            : []);

    return decls.flatMap((init: any) => {
      const call = unwrap(init);
      const config = calleeExport(call, trusted) === 'component' ? call.arguments?.[0]?.expression : undefined;

      return config?.type === 'ObjectExpression' ? [config] : [];
    });
  });
}

/** Every provable binding-site span in the module, in source order. */
function moduleSites(body: any[]): Span[] {
  const trusted = januxImports(body);
  const sites: Site[] = [];

  componentConfigs(body, trusted).forEach((config) => {
    const shape = stateShape(config, trusted);
    const arrow = viewArrow(config);

    if (!shape || !arrow || shadowsState(arrow.body)) return;
    collectSites(arrow.body, { shape, sites });
  });
  if (sites.length === 0) return [];
  const tainted = taintedNames(body, new Set<string>());

  return sites.filter((site) => site.idents.every((name) => !tainted.has(name))).map((site) => site.span);
}

/**
 * The transform hook's gate, mirroring `collectIslands`: dependencies and
 * virtual modules are not the app's islands, and a module that never says
 * `component(` has nothing to compile. Only the client graph goes through
 * here — the server resolves thunks inline anyway, so transforming its copy
 * would change nothing but the surface for surprises.
 */
export function compileClientModule(id: string, code: string): string | undefined {
  const path = id.split('?')[0] ?? id;

  if (id.startsWith('\0') || id.includes('node_modules') || !MODULE_PATH.test(path)) return undefined;
  if (!code.includes('component(')) return undefined;

  return compileBindingSites(code, path.endsWith('x'));
}

/**
 * Rewrites every provable state-path site in `code` into a binding thunk.
 * Returns the transformed module, or undefined when nothing provable was
 * found (or the module cannot be transformed safely — the caller ships the
 * code as written either way).
 */
export function compileBindingSites(code: string, tsx: boolean): string | undefined {
  const parsed = parseWithSpanBase(code, tsx);

  if (!parsed) return undefined;
  const sites = moduleSites(parsed.body);

  if (sites.length === 0) return undefined;
  const bytes = Buffer.from(code);
  const { offset } = parsed;
  const edits = sites.map(({ start, end }) => {
    const original = bytes.subarray(start - offset, end - offset).toString();

    return { start: start - offset, end: end - offset, text: `() => (${original})` };
  });

  // Every site is a `state…` read by construction; a slice that says otherwise
  // means the span base moved, and the only safe transform is none at all.
  if (edits.some(({ text }) => !text.startsWith('() => (state'))) return undefined;

  return splice(bytes, edits).toString();
}
