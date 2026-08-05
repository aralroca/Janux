/**
 * The documentation backlog: runtime exports that `reference/` pages do not
 * cover yet. `export-coverage.test.ts` fails when a new export is missing
 * from both the docs and this list, when a listed name stops being a real
 * export, and when a listed name becomes documented (remove it then) — so
 * the list can only shrink truthfully.
 *
 * It is currently EMPTY: every runtime export of every public entry is
 * documented in a reference page. A new export now fails the suite until it
 * is either documented or listed here deliberately.
 */
export const UNDOCUMENTED: Record<string, string[]> = {
  janux: [],
  'janux/types': [],
  'janux/server': [],
  'janux/client': [],
  'janux/manifest': [],
  'janux/interop': [],
  'janux/query': [],
  'janux/observability': [],
  'janux/worker': [],
  'janux/service-worker': [],
  '@janux/server': [],
  '@janux/content': [],
  '@janux/agent': [],
  '@janux/agent/local': [],
  '@janux/vite': [],
  '@janux/cli': [],
  '@janux/testing': [],
  '@janux/testing/playwright': [],
};
