import { parseSync } from '@swc/core';
import { MODULE_PATH, unwrap } from './islands';

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

interface Span {
  start: number;
  end: number;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * What the schema proves about one path. Text position is the strict case:
 * JSX drops null/undefined/boolean where `textOf` renders them, so only a
 * non-nullable string/number leaf is equivalent as text. `props` carries an
 * `obj()`'s resolved shape; a leaf (or anything unresolvable) has none.
 */
interface PathType {
  safe: boolean;
  props?: Map<string, PathType>;
}

const OPAQUE: PathType = { safe: false };

/** The builders whose value always renders the same as text, thunked or not. */
const TEXT_SAFE_BUILDERS = new Set(['str', 'int', 'num', 'money', 'enums']);

/** Chained modifiers that reintroduce null/undefined into a leaf. */
const UNSAFE_MODIFIERS = new Set(['optional', 'nullable']);

/**
 * Attributes a binding must not own: `value`/`checked` are live control
 * properties with focus-aware semantics, events delegate to named intents,
 * and the rest are the props `propToAttr` treats specially.
 */
const BLOCKED_ATTRS = new Set(['value', 'checked', 'key', 'children', 'dangerHTML', 'reset', 'on', 'intent', 'data-input']);
const EVENT_PROP = /^on[A-Z]/;

/** See scripts/packaging/specifiers.ts: the span base is read off a sentinel, not searched for. */
const SENTINEL = 'import "\0janux-span-base";\n';
const SENTINEL_AT = SENTINEL.indexOf('"');

/** Local names this module imported from 'janux', mapped to their exported names. */
function januxImports(body: any[]): Map<string, string> {
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
function calleeExport(node: any, trusted: Map<string, string>): string | undefined {
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
  if (TEXT_SAFE_BUILDERS.has(exported)) return { safe: !unsafe };
  if ((exported === 'obj' || exported === 'schema') && !unsafe) {
    const props = shapeOf(base.arguments?.[0]?.expression, trusted);

    return props ? { safe: false, props } : OPAQUE;
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

/** The `state.a.b` segments of a pure static member chain, root excluded — or undefined. */
function statePath(expr: any): string[] | undefined {
  const segments: string[] = [];
  let current = unwrap(expr);

  while (current?.type === 'MemberExpression') {
    const prop = current.property;

    if (prop?.type === 'Identifier') segments.unshift(prop.value);
    else if (prop?.type === 'Computed' && (prop.expression?.type === 'StringLiteral' || prop.expression?.type === 'NumericLiteral')) {
      segments.unshift(String(prop.expression.value));
    } else return undefined;
    current = unwrap(current.object);
  }

  return current?.type === 'Identifier' && current.value === 'state' && segments.length > 0 ? segments : undefined;
}

/** Whether the schema proves this path a non-nullable string/number leaf. */
function pathIsSafe(segments: string[], shape: Map<string, PathType>): boolean {
  let props: Map<string, PathType> | undefined = shape;
  let type: PathType | undefined;

  for (const segment of segments) {
    type = props?.get(segment);
    if (type === undefined) return false;
    props = type.props;
  }

  return type?.safe === true;
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

interface ViewAnalysis {
  shape: Map<string, PathType>;
  edits: Span[];
}

/** Walks the view's JSX collecting provable sites. Nested functions and component subtrees are out of scope. */
function collectSites(node: any, view: ViewAnalysis): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => collectSites(child, view));

    return;
  }
  // Another closure is another lifetime; a component's children are its data.
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return;
  if (node.type === 'JSXElement') {
    const name = node.opening?.name;
    const native = name?.type === 'Identifier' && /^[a-z]/.test(name.value);

    if (!native) return;
    (node.opening.attributes ?? []).forEach((attr: any) => {
      if (attr.type !== 'JSXAttribute' || attr.name?.type !== 'Identifier') return;
      if (EVENT_PROP.test(attr.name.value) || BLOCKED_ATTRS.has(attr.name.value)) return;
      if (attr.value?.type !== 'JSXExpressionContainer') return;
      const segments = statePath(attr.value.expression);

      if (segments && pathIsSafe(segments, view.shape)) view.edits.push(attr.value.expression.span);
    });
    node.children?.forEach((child: any) => {
      if (child.type !== 'JSXExpressionContainer') return collectSites(child, view);
      const segments = statePath(child.expression);
      const siblings = node.children.filter((other: any) => other !== child);

      if (segments && pathIsSafe(segments, view.shape) && !siblings.some(rendersText)) {
        view.edits.push(child.expression.span);
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

/** Every provable binding-site span in the module, in source order. */
function moduleSites(body: any[]): Span[] {
  const trusted = januxImports(body);
  const edits: Span[] = [];

  if (trusted.get('component') !== 'component') return edits;
  body.forEach((node) => {
    const decls =
      node.type === 'ExportDefaultExpression'
        ? [node.expression]
        : ((node.type === 'ExportDeclaration' ? node.declaration : node)?.type === 'VariableDeclaration'
            ? (node.type === 'ExportDeclaration' ? node.declaration : node).declarations.map((d: any) => d.init)
            : []);

    decls.forEach((init: any) => {
      const call = unwrap(init);

      if (calleeExport(call, trusted) !== 'component') return;
      const config = call.arguments?.[0]?.expression;

      if (config?.type !== 'ObjectExpression') return;
      const shape = stateShape(config, trusted);
      const arrow = viewArrow(config);

      if (!shape || !arrow || shadowsState(arrow.body)) return;
      collectSites(arrow.body, { shape, edits });
    });
  });

  return edits;
}

/** Right to left, so an earlier splice never moves a later span. */
function splice(source: Buffer, edits: Edit[]): Buffer {
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (bytes, { start, end, text }) => Buffer.concat([bytes.subarray(0, start), Buffer.from(text), bytes.subarray(end)]),
      source,
    );
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
  let sites: Span[];
  let sentinelStart: number;

  try {
    const program = parseSync(SENTINEL + code, { syntax: 'typescript', tsx });

    sentinelStart = (program.body[0] as any)?.source?.span.start;
    sites = moduleSites(program.body as any[]);
  } catch {
    return undefined;
  }
  if (sites.length === 0 || typeof sentinelStart !== 'number') return undefined;
  const bytes = Buffer.from(code);
  const offset = sentinelStart - SENTINEL_AT + SENTINEL.length;
  const edits = sites.map(({ start, end }) => {
    const original = bytes.subarray(start - offset, end - offset).toString();

    return { start: start - offset, end: end - offset, text: `() => (${original})` };
  });

  // Every site is a `state…` read by construction; a slice that says otherwise
  // means the span base moved, and the only safe transform is none at all.
  if (edits.some(({ text }) => !text.startsWith('() => (state'))) return undefined;

  return splice(bytes, edits).toString();
}
