import type { Case } from '../support/case';

/**
 * Which app a relative `dir` belongs to.
 *
 * A deployed server runs from somewhere else entirely — a bundle directory, a
 * serverless root — so a relative collection path resolves against
 * `JANUX_APP_ROOT` when it is set, and the working directory otherwise.
 *
 * The subtle half is *when*. Resolution happens while the declaring module is
 * being loaded, because that is the moment the collection's own app root is the
 * current one. A process serving two apps — a monorepo dev server, a test run,
 * a docs site next to a blog — publishes a different root for each; resolving
 * lazily at read time would hand every collection whichever root was published
 * last, and one app would quietly serve the other's posts. These rows declare
 * two collections under two roots and then read them in the wrong order on
 * purpose.
 */
export interface AppRootCase {
  /** `JANUX_APP_ROOT` while the collection is declared. `null` unsets it. */
  rootAtDeclaration: 'appA' | 'appB' | null;
  /** `JANUX_APP_ROOT` while the collection is read — deliberately not the same. */
  rootAtRead: 'appA' | 'appB' | null;
  /** Relative resolves against the root; absolute ignores it entirely. */
  dir: 'relative' | 'absolute-a';
  /** Titles the collection yields, which say which app's directory was read. */
  expected: string[];
}

export type AppRootRow = Case<AppRootCase>;

export const APP_ROOT_CASES: AppRootRow[] = [
  {
    id: 'content-approot-relative-dir-uses-the-declaration-root',
    src: 'janux',
    rootAtDeclaration: 'appA',
    rootAtRead: 'appA',
    dir: 'relative',
    expected: ['From A'],
  },
  {
    /** The regression this table exists for: A was declared under A, so A it stays. */
    id: 'content-approot-a-later-root-does-not-steal-an-earlier-collection',
    src: 'janux',
    rootAtDeclaration: 'appA',
    rootAtRead: 'appB',
    dir: 'relative',
    expected: ['From A'],
  },
  {
    id: 'content-approot-the-second-app-reads-its-own-directory',
    src: 'janux',
    rootAtDeclaration: 'appB',
    rootAtRead: 'appA',
    dir: 'relative',
    expected: ['From B'],
  },
  {
    /** Unset at read time is not a reset: the collection already knows where it lives. */
    id: 'content-approot-unsetting-the-root-later-changes-nothing',
    src: 'janux',
    rootAtDeclaration: 'appB',
    rootAtRead: null,
    dir: 'relative',
    expected: ['From B'],
  },
  {
    /** An absolute dir is taken as given, whatever the environment says. */
    id: 'content-approot-absolute-dir-ignores-the-root-at-declaration',
    src: 'janux',
    rootAtDeclaration: 'appB',
    rootAtRead: 'appB',
    dir: 'absolute-a',
    expected: ['From A'],
  },
  {
    id: 'content-approot-absolute-dir-ignores-an-unset-root',
    src: 'janux',
    rootAtDeclaration: null,
    rootAtRead: 'appB',
    dir: 'absolute-a',
    expected: ['From A'],
  },
];
