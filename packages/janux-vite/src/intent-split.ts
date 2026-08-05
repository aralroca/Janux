import { transformSync } from '@swc/core';
import { calleeExport, componentConfigs, januxImports } from './binding-sites';
import { MODULE_PATH, unwrap } from './islands';
import { parseWithSpanBase, sliceSpan, splice, type Edit, type Span } from './spans';

/**
 * Per-intent code splitting (the roadmap's compiler evolution, second
 * half). An inline `intent({ run })` whose run the analysis can prove
 * self-contained moves to a virtual module loaded on first invocation; the
 * stub left behind keeps `instance.intents[name]`'s callable shape, so the
 * wire markers, guards, schemas and the manifest never notice — and the
 * mutation gate already stays open across awaits for async runs.
 *
 * "Self-contained" is strict on purpose (a broken extraction is a broken
 * app, not a slow one): every free identifier of the run must be bound by
 * one of the module's imports (or be a harmless global), and no declaration
 * inside the run may collide with a module-scope name — the collision is
 * how the classic shadowing hole would smuggle a module-local reference
 * past the free-variable check. Anything unprovable ships inline as today.
 */

/** Globals a run may reference without needing an import. */
const GLOBALS = new Set([
  'console', 'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Promise',
  'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Error', 'TypeError', 'RangeError', 'RegExp',
  'URL', 'URLSearchParams', 'fetch', 'crypto', 'structuredClone', 'AbortController', 'FormData',
  'Request', 'Response', 'Headers', 'Blob', 'File', 'TextEncoder', 'TextDecoder', 'atob', 'btoa',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance',
  'navigator', 'location', 'document', 'window', 'localStorage', 'sessionStorage', 'globalThis',
  'undefined', 'NaN', 'Infinity',
]);

/** Object keys that hold types, not runtime code. */
const TYPE_KEYS = new Set(['typeAnnotation', 'returnType', 'typeArguments', 'typeParams', 'typeParameters', 'superTypeParams']);

/** Identifiers the node subtree references at runtime (over-approximated on purpose). */
function referencedIdents(node: any, out: Set<string>): Set<string> {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => referencedIdents(child, out));

    return out;
  }
  if (typeof node.type === 'string' && node.type.startsWith('Ts') && node.type.includes('Type')) return out;
  if (node.type === 'Identifier') {
    out.add(node.value);

    return out;
  }
  if (node.type === 'MemberExpression') {
    referencedIdents(node.object, out);
    if (node.property?.type === 'Computed') referencedIdents(node.property, out);

    return out;
  }
  if (node.type === 'KeyValueProperty' || node.type === 'KeyValuePatternProperty') {
    if (node.key?.type === 'Computed') referencedIdents(node.key, out);
    referencedIdents(node.value, out);

    return out;
  }
  Object.entries(node).forEach(([key, value]) => {
    if (!TYPE_KEYS.has(key) && key !== 'label') referencedIdents(value, out);
  });

  return out;
}

/** Every name a pattern binds. */
function patternNames(pattern: any, out: Set<string>): void {
  if (!pattern || typeof pattern !== 'object') return;
  switch (pattern.type) {
    case 'Identifier':
      out.add(pattern.value);

      return;
    case 'ObjectPattern':
      (pattern.properties ?? []).forEach((prop: any) => {
        if (prop.type === 'AssignmentPatternProperty') out.add(prop.key?.value);
        else if (prop.type === 'KeyValuePatternProperty') patternNames(prop.value, out);
        else patternNames(prop.argument, out);
      });

      return;
    case 'ArrayPattern':
      (pattern.elements ?? []).forEach((el: any) => patternNames(el, out));

      return;
    case 'AssignmentPattern':
      patternNames(pattern.left, out);

      return;
    case 'RestElement':
      patternNames(pattern.argument, out);

      return;
    default:
      return;
  }
}

/** Every name bound anywhere inside the function: params, declarations, catches — nested included. */
function boundNames(node: any, out: Set<string>): Set<string> {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => boundNames(child, out));

    return out;
  }
  if (node.type === 'VariableDeclarator') patternNames(node.id, out);
  if (node.type === 'CatchClause') patternNames(node.param, out);
  if (node.type === 'ArrowFunctionExpression') (node.params ?? []).forEach((p: any) => patternNames(p, out));
  if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
    if (node.identifier) out.add(node.identifier.value);
    (node.params ?? []).forEach((p: any) => patternNames(p.pat, out));
  }
  if (node.type === 'ClassDeclaration' && node.identifier) out.add(node.identifier.value);
  Object.values(node).forEach((value) => boundNames(value, out));

  return out;
}

/** Names any top-level statement binds (imports and declarations alike). */
function moduleScopeNames(body: any[]): Set<string> {
  const names = new Set<string>();

  body.forEach((node) => {
    if (node.type === 'ImportDeclaration') {
      (node.specifiers ?? []).forEach((spec: any) => names.add(spec.local?.value));

      return;
    }
    const decl = node.type === 'ExportDeclaration' ? node.declaration : node;

    if (decl?.type === 'VariableDeclaration') decl.declarations.forEach((d: any) => patternNames(d.id, names));
    if (decl?.type === 'FunctionDeclaration' || decl?.type === 'ClassDeclaration') {
      if (decl.identifier) names.add(decl.identifier.value);
    }
  });

  return names;
}

interface ImportInfo {
  span: Span;
  locals: Set<string>;
}

function moduleImports(body: any[]): ImportInfo[] {
  return body
    .filter((node) => node.type === 'ImportDeclaration' && !node.typeOnly)
    .map((node) => {
      const locals = new Set<string>();

      (node.specifiers ?? []).forEach((spec: any) => !spec.isTypeOnly && locals.add(spec.local?.value));

      return { span: node.span, locals };
    });
}

interface SplitRun {
  island: string;
  intent: string;
  runSpan: Span;
  /** Import statements the extracted run needs, by span. */
  importSpans: Span[];
}

/** The literal `name` property of a config object. */
function nameOf(config: any): string | undefined {
  const name = (config.properties ?? []).find(
    (prop: any) => prop.type === 'KeyValueProperty' && prop.key?.value === 'name',
  );
  const value = name ? unwrap(name.value) : undefined;

  return value?.type === 'StringLiteral' ? value.value : undefined;
}

/** Every provably extractable run in the module. */
function splitRuns(body: any[]): SplitRun[] {
  const trusted = januxImports(body);

  if (trusted.get('intent') !== 'intent') return [];
  const scope = moduleScopeNames(body);
  const imports = moduleImports(body);
  const importedNames = new Set(imports.flatMap((imp) => [...imp.locals]));
  const runs: SplitRun[] = [];

  componentConfigs(body, trusted).forEach((config) => {
    const island = nameOf(config);
    const intents = (config.properties ?? []).find(
      (prop: any) => prop.type === 'KeyValueProperty' && prop.key?.value === 'intents',
    );
    const object = intents ? unwrap(intents.value) : undefined;

    if (!island || object?.type !== 'ObjectExpression') return;
    (object.properties ?? []).forEach((prop: any) => {
      if (prop.type !== 'KeyValueProperty') return;
      const intentName = prop.key?.type === 'Identifier' || prop.key?.type === 'StringLiteral' ? prop.key.value : undefined;
      const call = unwrap(prop.value);

      if (!intentName || calleeExport(call, trusted) !== 'intent') return;
      const def = call.arguments?.[0]?.expression;

      if (def?.type !== 'ObjectExpression') return;
      const runProp = (def.properties ?? []).find((p: any) => p.type === 'KeyValueProperty' && p.key?.value === 'run');
      const run = runProp ? unwrap(runProp.value) : undefined;

      if (run?.type !== 'ArrowFunctionExpression' && run?.type !== 'FunctionExpression') return;
      const bound = boundNames(run, new Set<string>());

      // The collision kill rule: an inner binding that reuses a module-scope
      // name could hide a genuine outer reference from the free-variable set.
      if ([...bound].some((name) => scope.has(name))) return;
      const free = [...referencedIdents(run, new Set<string>())].filter(
        (name) => !bound.has(name) && !GLOBALS.has(name),
      );

      if (!free.every((name) => importedNames.has(name))) return;
      const needed = imports.filter((imp) => free.some((name) => imp.locals.has(name)));

      runs.push({ island, intent: intentName, runSpan: run.span, importSpans: needed.map((imp) => imp.span) });
    });
  });

  return runs;
}

/**
 * The import specifier the stub asks for. Encoded so paths survive the
 * scheme; suffixed `.js` because the virtual module is served as plain JS
 * (intent names cannot contain `.`, so the suffix is unambiguous).
 */
export function intentVirtualId(module: string, island: string, intent: string): string {
  return `janux-intent:${encodeURIComponent(module)}:${encodeURIComponent(island)}:${encodeURIComponent(intent)}.js`;
}

/** The parts of a resolved (`\0`-prefixed) virtual id — undefined for anything else. */
export function parseIntentVirtualId(id: string): { module: string; island: string; intent: string } | undefined {
  if (!id.startsWith('\0janux-intent:')) return undefined;
  const parts = id.slice('\0janux-intent:'.length).split(':');

  if (parts.length !== 3) return undefined;

  return {
    module: decodeURIComponent(parts[0]!),
    island: decodeURIComponent(parts[1]!),
    intent: decodeURIComponent(parts[2]!.replace(/\.js$/, '')),
  };
}

/**
 * Rewrites every extractable run into a lazy stub. Undefined when nothing
 * is provable — the module ships as written.
 */
export function splitIntentsTransform(code: string, tsx: boolean, moduleId: string): string | undefined {
  const parsed = parseWithSpanBase(code, tsx);

  if (!parsed) return undefined;
  const runs = splitRuns(parsed.body);

  if (runs.length === 0) return undefined;
  const bytes = Buffer.from(code);
  const edits: Edit[] = runs.map(({ island, intent, runSpan }) => ({
    start: runSpan.start - parsed.offset,
    end: runSpan.end - parsed.offset,
    text: `(__jxBag) => import(${JSON.stringify(intentVirtualId(moduleId, island, intent))}).then((__jxMod) => __jxMod.run(__jxBag))`,
  }));

  return splice(bytes, edits).toString();
}

/**
 * The virtual module for one extracted run: the import statements it needs,
 * verbatim (relative specifiers are resolved against the original module by
 * the plugin), plus the run itself. Re-derived from the file on every load,
 * so dev edits never serve a stale run.
 */
export function extractIntentRun(code: string, tsx: boolean, island: string, intent: string): string | undefined {
  const parsed = parseWithSpanBase(code, tsx);

  if (!parsed) return undefined;
  const run = splitRuns(parsed.body).find((r) => r.island === island && r.intent === intent);

  if (!run) return undefined;
  const bytes = Buffer.from(code);
  const imports = run.importSpans.map((span) => sliceSpan(bytes, span, parsed.offset)).join('\n');
  const source = `${imports}${imports ? '\n' : ''}export const run = ${sliceSpan(bytes, run.runSpan, parsed.offset)};\n`;

  // Emitted as plain JS: a percent-encoded scheme id gives the bundler no
  // reliable extension to infer a loader from, so nothing is left to infer.
  return transformSync(source, {
    jsc: {
      parser: { syntax: 'typescript', tsx },
      target: 'esnext',
      transform: { react: { runtime: 'automatic', importSource: 'janux' } },
    },
  }).code;
}

/** The transform-hook gate, mirroring the binding-sites one. */
export function splitClientModule(id: string, code: string): string | undefined {
  const path = id.split('?')[0] ?? id;

  if (id.startsWith('\0') || id.includes('node_modules') || !MODULE_PATH.test(path)) return undefined;
  if (!code.includes('intent(')) return undefined;

  return splitIntentsTransform(code, path.endsWith('x'), path);
}
