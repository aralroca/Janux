import type { ManifestTool } from 'janux/manifest';

/**
 * The terminal face of a tool, derived from the JSON Schema the manifest
 * already carries: one `--flag` per declared property, typed by the property.
 * Nothing here is declared for the CLI — if a tool gained an argument, it
 * gained a flag, and the usage below says so without anyone writing it down.
 */

interface JsonProperty {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
}

const FLAG = /^--/;
const FALSY = /^(false|0|no)$/i;

/** A nullable property is `['string', 'null']`; the value a flag carries is the non-null half. */
function typeOf(property: JsonProperty): string {
  return [property.type ?? 'string'].flat().find((name) => name !== 'null') ?? 'string';
}

function asNumber(raw: string, flag: string): number {
  const value = Number(raw);

  if (!Number.isFinite(value)) throw new Error(`janux run: --${flag} takes a number, got "${raw}"`);

  return value;
}

function asJson(raw: string, flag: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`janux run: --${flag} takes JSON, got "${raw}"`);
  }
}

const COERCE: Record<string, (raw: string, flag: string) => unknown> = {
  string: (raw) => raw,
  integer: asNumber,
  number: asNumber,
  boolean: (raw) => !FALSY.test(raw),
  array: asJson,
  object: asJson,
};

/** `--flag value`, or `--flag` alone when the next token is another flag. */
function flagPairs(argv: string[]): [string, string | undefined][] {
  return argv
    .map((token, index) => [token, argv[index + 1]] as const)
    .filter(([token]) => FLAG.test(token))
    .map(([token, next]) => [token.slice(2), next !== undefined && !FLAG.test(next) ? next : undefined]);
}

function valueOf(flag: string, raw: string | undefined, properties: Record<string, JsonProperty>): unknown {
  const property = properties[flag];

  // A typo'd flag that is quietly dropped invokes the tool with different
  // arguments than the ones that were typed — the one thing a scripted call
  // must never do.
  if (!property) throw new Error(`janux run: unknown argument "--${flag}"`);
  if (raw !== undefined) return (COERCE[typeOf(property)] ?? COERCE.string)(raw, flag);
  if (typeOf(property) === 'boolean') return true;

  throw new Error(`janux run: --${flag} needs a value`);
}

/**
 * Flags → the input object the tool's schema describes. What is *missing* is
 * not checked here: the invocation pipeline validates every call anyway, and a
 * second implementation of the same rules is a second set of rules.
 */
export function parseToolArgs(argv: string[], input?: Record<string, unknown>): Record<string, unknown> {
  const properties = (input?.properties ?? {}) as Record<string, JsonProperty>;

  return Object.fromEntries(flagPairs(argv).map(([flag, raw]) => [flag, valueOf(flag, raw, properties)]));
}

/** What a value may be, as the schema puts it: a type, or the members of an enum. */
function labelOf(property: JsonProperty): string {
  return property.enum ? property.enum.join('|') : typeOf(property);
}

function isRequired(input: Record<string, unknown> | undefined, name: string): boolean {
  return ((input?.required ?? []) as string[]).includes(name);
}

function propertiesOf(tool: ManifestTool): [string, JsonProperty][] {
  return Object.entries((tool.input?.properties ?? {}) as Record<string, JsonProperty>);
}

/** `--a <string> [--b <integer>]`: required arguments bare, optional ones bracketed. */
function synopsis(tool: ManifestTool): string {
  return propertiesOf(tool)
    .map(([name, property]) => {
      const flag = `--${name} <${labelOf(property)}>`;

      return isRequired(tool.input, name) ? flag : `[${flag}]`;
    })
    .join(' ');
}

function noteFor(tool: ManifestTool, name: string, property: JsonProperty): string {
  if (isRequired(tool.input, name)) return 'required';

  return property.default === undefined ? '' : `default: ${JSON.stringify(property.default)}`;
}

function argumentLine(tool: ManifestTool, name: string, property: JsonProperty, widths: [number, number]): string {
  const [flag, type] = widths;

  return `  ${`--${name}`.padEnd(flag)}  ${`<${labelOf(property)}>`.padEnd(type)}  ${noteFor(tool, name, property)}`.trimEnd();
}

/** The tool's help, generated from its declaration — description, synopsis and one line per argument. */
export function usageFor(tool: ManifestTool): string {
  const args = propertiesOf(tool);
  const widths: [number, number] = [
    Math.max(0, ...args.map(([name]) => name.length + 2)),
    Math.max(0, ...args.map(([, property]) => labelOf(property).length + 2)),
  ];
  const lines = [`Usage: janux run ${tool.name} ${synopsis(tool)}`.trimEnd()];

  if (tool.description) lines.push('', `  ${tool.description}`);
  if (args.length) lines.push('', 'Arguments:', ...args.map(([name, property]) => argumentLine(tool, name, property, widths)));

  return `${lines.join('\n')}\n`;
}

/** Every tool this app projects, as the manifest lists them: name, guard, description. */
export function toolList(tools: ManifestTool[]): string {
  const width = Math.max(0, ...tools.map((tool) => tool.name.length));
  const lines = tools.map((tool) => `  ${tool.name.padEnd(width)}  ${`[${tool.guard}]`.padEnd(9)} ${tool.description ?? ''}`.trimEnd());

  return `${['Tools:', ...lines, '', 'Run one with: janux run <tool> [--arg value]'].join('\n')}\n`;
}
