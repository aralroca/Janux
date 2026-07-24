/**
 * The documentation backlog: runtime exports that `reference/` pages do not
 * cover yet. `export-coverage.test.ts` fails when a new export is missing
 * from both the docs and this list, when a listed name stops being a real
 * export, and when a listed name becomes documented (remove it then) — so
 * the list can only shrink truthfully. Empty arrays are kept as the target.
 */
export const UNDOCUMENTED: Record<string, string[]> = {
  janux: ['CLIENT_TOOL_NAMES', 'CLIENT_TOOL_SPECS', 'JxType', 'formatElements', 'getI18n', 'selectMessages', 'translateCore'],
  'janux/types': ['JxType'],
  'janux/server': ['renderNode'],
  'janux/client': [
  ],
  'janux/manifest': [],
  'janux/interop': [],
  'janux/query': [],
  '@janux/server': ['createHttpHandlers'],
  '@janux/agent': [
  ],
  '@janux/agent/local': ['DEFAULT_LOCAL_MODEL', 'supportsLocalLlm'],
  '@janux/vite': ['apiFiles', 'apiModuleName', 'apiStubModule', 'exportedApiNames', 'resolveAppConfig', 'sendFetchResponse', 'toFetchRequest'],
  '@janux/cli': ['HELP_TEXT', 'parseArgs', 'runCli'],
};
