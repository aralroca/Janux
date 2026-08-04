/**
 * What a codemod is, in one shape, whether it repairs a Janux breaking change
 * or translates an app arriving from another framework.
 */

export interface CodemodInput {
  /** The file's current contents. */
  code: string;
  /** Its path, relative to the app root — codemods that move files reason about it. */
  file: string;
}

/**
 * What a codemod wants done to one file. Every field is optional because the
 * common answer is "nothing": a codemod that has already run over a file has
 * no edit and no move left to report, which is what makes a second run a no-op
 * instead of a second diff.
 */
export interface CodemodResult {
  /** The rewritten source, absent when the file is already as it should be. */
  code?: string;
  /** Where the file belongs, app-relative, absent when it stays put. */
  moveTo?: string;
  /**
   * What a human still has to do here. A codemod that cannot translate
   * something says so on the file it found it in, rather than translating it
   * wrongly or staying quiet — the two ways a migration tool loses trust.
   */
  notes?: string[];
}

export interface Codemod {
  /** Stable identifier, also what `janux codemod <id>` takes. */
  id: string;
  title: string;
  description: string;
  /**
   * The Janux release whose breaking change this repairs. `janux upgrade` runs
   * the codemods whose `since` lies in the range being crossed; a codemod
   * without one is a framework migration, run on request only.
   */
  since?: string;
  /** Whether this codemod has anything to say about a file, by path alone. */
  appliesTo(file: string): boolean;
  run(input: CodemodInput): CodemodResult;
}

/** Files a source-level codemod reads: JS/TS, with or without JSX. */
export const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
