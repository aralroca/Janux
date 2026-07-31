/**
 * The root CHANGELOG.md, folded out of the per-package ones changesets writes.
 *
 * Eight packages release on one version, so eight changelogs are eight places
 * to look for what a single release did. The root file is the one a reader
 * opens; these functions are what keep it from being written by hand.
 *
 * Two things are dropped on the way up. Dependency bumps, because in a fixed
 * group every package always bumps every sibling and saying so eight times
 * says nothing. And empty sections left behind by that removal.
 */

export type Section = { readonly version: string; readonly body: string };
export type PackageNotes = { readonly name: string; readonly body: string };

const HEADING = /^## (.+)$/m;
/**
 * Deliberately not `/m`: the bump owns its indented continuation lines, and a
 * multiline `$` would end the match at the first line break instead of at the
 * next bullet, leaving `- janux@0.6.0` orphaned in the file.
 */
const DEPENDENCY_BUMP = /(?:^|\n)- Updated dependencies[\s\S]*?(?=\n- |\n#{2,4} |$)/g;
const BLOCK_START = /^(?=#{3,4} )/m;
const BULLET = /^- /m;

/** The newest release of a changelog: its first `## version` heading and everything under it. */
export function topSection(text: string): Section | undefined {
  const heading = HEADING.exec(text);

  if (!heading) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  const next = HEADING.exec(rest);

  return { version: heading[1]!.trim(), body: (next ? rest.slice(0, next.index) : rest).trim() };
}

/** A `### Heading` block with no bullet left under it was nothing but bumps. */
export function withoutDependencyBumps(body: string): string {
  const blocks = body.replace(DEPENDENCY_BUMP, '').split(BLOCK_START);

  return blocks
    .filter((block) => BULLET.test(block))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One level deeper, so a package's own `### Minor Changes` nests under its name. */
function demote(body: string): string {
  return body.replace(/^(#{1,5}) /gm, '#$1 ');
}

export function rootSection(version: string, notes: readonly PackageNotes[]): string {
  const blocks = notes
    .map((note) => ({ name: note.name, body: withoutDependencyBumps(note.body) }))
    .filter((note) => note.body !== '')
    .map((note) => `### ${note.name}\n\n${demote(note.body)}`);

  return [`## ${version}`, ...blocks].join('\n\n');
}

/**
 * Newest first, above the oldest release and below whatever prose the file
 * opens with: history is never rewritten, only pushed down.
 */
export function prepend(existing: string, section: string): string {
  const first = HEADING.exec(existing);
  const at = first ? first.index : existing.length;

  return `${existing.slice(0, at).trimEnd()}\n\n${section}\n\n${existing.slice(at).trimStart()}`.trim().concat('\n');
}
