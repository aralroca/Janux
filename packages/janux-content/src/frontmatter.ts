import { parse as parseYaml } from 'yaml';
import { validate, type Infer, type JxType } from 'janux';

/**
 * Frontmatter: the typed half of a content file.
 *
 * Two rules make this boring on purpose. The block is read with YAML's *core*
 * schema, so `2026-07-01` stays the ISO string the author wrote instead of
 * becoming a `Date` the schema layer has no kind for. And the parsed map is
 * then handed to the framework's own `validate()` — the same function that
 * validates component state and intent input. Content and state are validated
 * by one implementation, not two that agree today.
 */

export interface SplitSource {
  /** The frontmatter block's YAML, or `undefined` when the file opens with content. */
  yaml: string | undefined;
  body: string;
}

const OPENS = /^---[ \t]*\r?\n/;
const CLOSES = /^---[ \t]*(\r?\n|$)/m;

/** Splits a leading `---` block from the body. Only column 0 of line 1 opens one. */
export function splitFrontmatter(source: string): SplitSource {
  const opening = OPENS.exec(source);

  if (!opening) return { yaml: undefined, body: source };
  const rest = source.slice(opening[0].length);
  const closing = CLOSES.exec(rest);

  // A block nobody closed is a typo, and reading it as body hides the typo
  // behind a page that renders its own metadata.
  if (!closing) throw new Error('Janux content: unterminated frontmatter block — the opening `---` has no closing `---`.');

  return {
    yaml: rest.slice(0, closing.index).replace(/\r?\n$/, ''),
    body: rest.slice(closing.index + closing[0].length).replace(/^(?:[ \t]*\r?\n)+/, ''),
  };
}

export interface ParsedSource {
  data: Record<string, unknown>;
  body: string;
}

/** Splits and parses the frontmatter block. Values are YAML core types; nothing is validated yet. */
export function parseFrontmatter(source: string): ParsedSource {
  const { yaml, body } = splitFrontmatter(source);

  if (yaml === undefined) return { data: {}, body };
  const parsed = yaml.trim() === '' ? {} : parseYaml(yaml);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Janux content: frontmatter must be a map of fields.');
  }

  return { data: parsed as Record<string, unknown>, body };
}

/**
 * Validates parsed frontmatter against the collection's schema. Failing loudly,
 * naming the file and every bad field, is the point: a page whose metadata is
 * wrong should stop the build, not ship a title reading `undefined`.
 */
export function validateFrontmatter<S extends JxType<any>>(type: S, data: unknown, file: string): Infer<S> {
  const result = validate(type, data);

  if (!result.ok) {
    const fields = result.errors.map((error) => `  ${error.path}: ${error.message}`).join('\n');

    throw new Error(`Janux content: invalid frontmatter in ${file}\n${fields}`);
  }

  return result.value as Infer<S>;
}
