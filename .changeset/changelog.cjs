/**
 * The changelog entry format, which is the default one minus two things.
 *
 * The commit hash prefix, because an unlinked seven-character hash in front of
 * every line is noise to the person the changelog is for — the release is
 * tagged, and `git log` is right there.
 *
 * The dependency bump lines, because the eight packages are a fixed group:
 * every one of them bumps every other one on every release, so "Updated
 * dependencies → janux@0.6.0" is a restatement of the version number at the
 * top of the section, eight times over.
 *
 * CommonJS on purpose: `@changesets/apply-release-plan` loads this with
 * `require()`, and the repository is `"type": "module"`.
 */

/** Continuation lines are indented so a wrapped summary stays one list item. */
async function getReleaseLine(changeset) {
  const [first, ...rest] = changeset.summary.split('\n').map((line) => line.trimEnd());
  const continuation = rest.map((line) => `  ${line}`).join('\n');

  return rest.length > 0 ? `- ${first}\n${continuation}` : `- ${first}`;
}

async function getDependencyReleaseLine() {
  return '';
}

module.exports = { getReleaseLine, getDependencyReleaseLine };
