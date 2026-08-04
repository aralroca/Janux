import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { list, schema, str, validate } from 'janux';

/**
 * Skills: procedures the model loads on demand.
 *
 * A tool says what one call does. A skill says how several of them add up to a
 * task — the order, the criteria, the example. Shipping that as prose in the
 * system prompt does not scale: every page of procedure is paid for on every
 * turn, by every caller, whether or not the task ever comes up. So a skill is
 * split in two. Its *index* entry (name, description, when to use it) is small
 * enough to always be in context; its body is fetched only once the model
 * decides the task is this one.
 *
 * The convention mirrors routes: the filesystem is the declaration.
 * `src/skills/refund.md` and `src/skills/refund/SKILL.md` both declare a skill
 * named `refund` — the second form when the procedure wants sibling files.
 *
 * A skill is documentation, never a channel: loading one returns text. The
 * tools it describes are still invoked through the same pipeline, with the same
 * guards, as a click.
 *
 * Which is also the boundary. Tools are filtered per caller — `forbidden`
 * removes a name from the manifest so an agent that may not call it is never
 * told it exists — and skills are *not*: they are authored content, listed for
 * everyone who reaches the surface, like the copy on a page. Guards still hold
 * on every call the procedure describes, so nothing becomes executable; but
 * what a caller may not be told does not belong in `src/skills/`.
 */

export interface Skill {
  name: string;
  /** What the procedure is — the index line the model routes on. */
  description: string;
  /** When to reach for it. Optional: some skills are obvious from the description. */
  when?: string;
  /** The tools the procedure uses. `janux verify` checks every one of them exists. */
  tools: string[];
  /** The markdown body, loaded on demand. */
  body: string;
  /** Absolute source path — what a diagnostic names. */
  file: string;
}

/** A skill without its body: what the index, the manifest and MCP's resource list carry. */
export type SkillSummary = Omit<Skill, 'body' | 'file'>;

/**
 * Frontmatter is validated by `validate()` — the same function that checks
 * component state, intent input and content frontmatter. A skill's metadata is
 * as trustworthy as an island's state because one implementation checks both.
 */
const FRONTMATTER = schema({
  name: str().min(1).optional(),
  description: str().min(1),
  when: str().min(1).optional(),
  tools: list(str()).default([]),
});

/**
 * Splits the leading `---` block. Only column 0 of line 1 opens one, and a
 * block nobody closed is a typo — reading it as body would hide the typo behind
 * a skill whose description is its own YAML.
 */
const OPENS = /^---[ \t]*\r?\n/;
const CLOSES = /^---[ \t]*(\r?\n|$)/m;

function splitFrontmatter(source: string, name: string): { yaml: string; body: string } {
  const opening = OPENS.exec(source);

  if (!opening) throw new Error(`Janux skills: "${name}" has no frontmatter — a skill needs at least a description.`);
  const rest = source.slice(opening[0].length);
  const closing = CLOSES.exec(rest);

  if (!closing) throw new Error(`Janux skills: "${name}" has an unterminated frontmatter block.`);

  return { yaml: rest.slice(0, closing.index), body: rest.slice(closing.index + closing[0].length).replace(/^(?:[ \t]*\r?\n)+/, '') };
}

function parseYamlBlock(yaml: string, name: string): unknown {
  try {
    return yaml.trim() === '' ? {} : parseYaml(yaml);
  } catch (error) {
    throw new Error(`Janux skills: unparseable frontmatter in "${name}"\n${(error as Error).message}`, { cause: error });
  }
}

function validFrontmatter(data: unknown, name: string): SkillSummary {
  const result = validate(FRONTMATTER, data);

  if (result.ok) return result.value as SkillSummary;
  const fields = result.errors.map((error) => `  ${error.path}: ${error.message}`).join('\n');

  throw new Error(`Janux skills: invalid frontmatter in "${name}"\n${fields}`);
}

/**
 * One skill file. `id` is the path-derived name; frontmatter may override it,
 * exactly as a content entry may override its slug.
 */
export function parseSkill(source: string, id: string, file = id): Skill {
  const { yaml, body } = splitFrontmatter(source, id);
  const front = validFrontmatter(parseYamlBlock(yaml, id), id);

  return { ...front, name: front.name ?? id, body, file };
}

function skillSource(dir: string, entry: string): { id: string; file: string } | undefined {
  const path = join(dir, entry);

  if (entry.endsWith('.md')) return { id: entry.slice(0, -'.md'.length), file: path };
  if (!statSync(path).isDirectory()) return undefined;
  const packaged = join(path, 'SKILL.md');

  return existsSync(packaged) ? { id: entry, file: packaged } : undefined;
}

function assertDistinct(skills: Skill[]): Skill[] {
  const clash = skills.find((skill, index) => skills.findIndex((other) => other.name === skill.name) !== index);

  if (clash) throw new Error(`Janux skills: two skills are both named "${clash.name}" — names are how the model asks for one.`);

  return skills;
}

/** Every skill under `dir`, sorted by name. A missing directory is simply no skills. */
export function discoverSkills(dir: string): Skill[] {
  if (!existsSync(dir)) return [];
  const skills = readdirSync(dir)
    .map((entry) => skillSource(dir, entry))
    .filter((source) => source !== undefined)
    .map(({ id, file }) => parseSkill(readFileSync(file, 'utf8'), id, file));

  return assertDistinct(skills).sort((a, b) => a.name.localeCompare(b.name));
}

/** The index the model always sees: names and when to use them, never bodies. */
export function skillIndex(skills: readonly Skill[]): SkillSummary[] {
  return skills.map(({ name, description, when, tools }) => ({ name, description, ...(when && { when }), tools }));
}
