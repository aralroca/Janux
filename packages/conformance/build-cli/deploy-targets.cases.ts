import { unsupportedFeatures, type AdapterCapabilities } from '../../janux-cli/src/adapter';
import { vercelConfig } from '../../janux-vercel/src/index';
import { parseVercelArgs } from '../../janux-vercel/src/cli';
import type { Case } from '../support/case';

/**
 * The contract between an app and the target it is deployed to.
 *
 * Capabilities are declared by the adapter, never sniffed, so the only thing
 * that can go wrong is the report: an app whose `src/ws.ts` will never hold a
 * connection open has to hear it at build time, and an app that uses nothing of
 * the sort must not be warned about a flag it does not care about.
 *
 * `vercel.json` is the other half. It is generated rather than documented,
 * because Vercel reads it *before* the build runs — so what it says about the
 * runtime and the build command is the whole deployment.
 */

export interface CapabilityCase {
  /** `true` when the app has a `src/ws.ts`. */
  websocketModule: boolean;
  /** `true` when the app has a `src/schedules/`. */
  schedulesDir?: boolean;
  /** `'static'` when the app prerenders — the only mode where declared rules need the host. */
  output?: 'static' | 'bun';
  /** How many `redirects`/`rewrites` janux.config.ts declared. */
  routingRules?: number;
  capabilities: AdapterCapabilities;
  /** The feature each gap must name, in order. */
  gaps: string[];
}

export type CapabilityRow = Case<CapabilityCase>;

const WS = 'src/ws.ts';
const STREAM = 'streaming SSR';
const SPOOL = 'spoolMultipart()';
const SCHEDULES = 'src/schedules/';
const RULES = 'redirects/rewrites';

export const CAPABILITY_CASES: CapabilityRow[] = [
  {
    id: 'build2-target-that-can-do-everything-warns-about-nothing',
    src: 'janux',
    websocketModule: true,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: 'process', redirects: true },
    gaps: [],
  },
  {
    id: 'build2-target-without-websockets-names-the-app-file-it-breaks',
    src: 'janux',
    websocketModule: true,
    capabilities: { websocket: false, streaming: true, filesystem: true, schedules: 'process', redirects: true },
    gaps: [WS],
  },
  {
    id: 'build2-an-app-with-no-websockets-hears-nothing-about-them',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: false, streaming: true, filesystem: true, schedules: 'process', redirects: true },
    gaps: [],
  },
  {
    id: 'build2-a-buffering-target-says-so-whatever-the-app-does',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: true, streaming: false, filesystem: true, schedules: 'process', redirects: true },
    gaps: [STREAM],
  },
  {
    id: 'build2-a-read-only-target-names-the-upload-primitive',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: true, streaming: true, filesystem: false, schedules: 'process', redirects: true },
    gaps: [SPOOL],
  },
  {
    id: 'build2-every-gap-is-reported-in-one-pass',
    src: 'janux',
    websocketModule: true,
    capabilities: { websocket: false, streaming: false, filesystem: false, schedules: 'process', redirects: true },
    gaps: [WS, STREAM, SPOOL],
  },
  {
    id: 'build2-streaming-and-uploads-are-reported-without-a-websocket-module',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: true, streaming: false, filesystem: false, schedules: 'process', redirects: true },
    gaps: [STREAM, SPOOL],
  },
  {
    id: 'build2-a-target-that-cannot-trigger-jobs-names-the-schedules-directory',
    src: 'janux',
    websocketModule: false,
    schedulesDir: true,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: false, redirects: true },
    gaps: [SCHEDULES],
  },
  {
    id: 'build2-an-app-with-no-schedules-hears-nothing-about-them',
    src: 'janux',
    websocketModule: false,
    schedulesDir: false,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: false, redirects: true },
    gaps: [],
  },
  {
    /** Either trigger runs them, so neither is a gap — only the difference in how. */
    id: 'build2-a-cron-triggered-target-is-not-a-gap-for-an-app-with-schedules',
    src: 'janux',
    websocketModule: false,
    schedulesDir: true,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: 'http', redirects: true },
    gaps: [],
  },
  {
    /**
     * The one feature whose gap depends on the output mode: a static export
     * leaves no server to apply the declared rules, so they exist only if the
     * host's config can say them.
     */
    id: 'build2-a-static-export-on-a-target-that-cannot-express-redirects-is-told',
    src: 'janux',
    websocketModule: false,
    output: 'static',
    routingRules: 2,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: 'process', redirects: false },
    gaps: [RULES],
  },
  {
    id: 'build2-a-static-export-on-a-target-that-can-express-them-hears-nothing',
    src: 'janux',
    websocketModule: false,
    output: 'static',
    routingRules: 2,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: 'process', redirects: true },
    gaps: [],
  },
  {
    /** With a server running, Janux applies them — the flag is irrelevant. */
    id: 'build2-a-server-app-keeps-its-redirects-whatever-the-target-can-express',
    src: 'janux',
    websocketModule: false,
    output: 'bun',
    routingRules: 2,
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: 'process', redirects: false },
    gaps: [],
  },
  {
    id: 'build2-an-app-declaring-no-redirects-is-never-warned-about-them',
    src: 'janux',
    websocketModule: false,
    output: 'static',
    capabilities: { websocket: true, streaming: true, filesystem: true, schedules: 'process', redirects: false },
    gaps: [],
  },
];

export interface VercelConfigCase {
  options: { output?: 'bun' | 'static'; buildCommand?: string; include?: string[]; maxDuration?: number };
  /** Fields the row is about; `undefined` asserts the key is absent. */
  expected: Partial<{ buildCommand: string; bunVersion: string | undefined; cleanUrls: boolean | undefined }>;
}

export type VercelConfigRow = Case<VercelConfigCase>;

const BUILD = 'bun run build && bunx janux-vercel';

export const VERCEL_CONFIG_CASES: VercelConfigRow[] = [
  {
    id: 'build2-vercel-runs-a-server-app-on-bun',
    src: 'janux',
    options: {},
    expected: { buildCommand: BUILD, bunVersion: '1.x', cleanUrls: undefined },
  },
  {
    id: 'build2-vercel-gives-a-static-export-no-runtime-to-choose',
    src: 'janux',
    options: { output: 'static' },
    expected: { bunVersion: undefined, cleanUrls: true },
  },
  {
    id: 'build2-vercel-passes-every-include-back-to-the-command-it-generates',
    src: 'janux',
    options: { include: ['content', 'data'] },
    expected: { buildCommand: `${BUILD} --include content --include data` },
  },
  {
    id: 'build2-vercel-carries-the-max-duration-into-the-build-command',
    src: 'janux',
    options: { maxDuration: 60 },
    expected: { buildCommand: `${BUILD} --max-duration 60` },
  },
  {
    id: 'build2-vercel-puts-the-includes-before-the-duration',
    src: 'janux',
    options: { include: ['content'], maxDuration: 30 },
    expected: { buildCommand: `${BUILD} --include content --max-duration 30` },
  },
  {
    id: 'build2-vercel-keeps-a-build-command-the-app-chose',
    src: 'janux',
    options: { buildCommand: 'bun run ci' },
    expected: { buildCommand: 'bun run ci', bunVersion: '1.x' },
  },
  {
    id: 'build2-vercel-still-passes-includes-for-a-static-export',
    src: 'janux',
    options: { output: 'static', include: ['content'] },
    expected: { buildCommand: `${BUILD} --include content`, cleanUrls: true },
  },
  {
    id: 'build2-vercel-drops-a-zero-duration-rather-than-writing-it-out',
    src: 'janux',
    options: { maxDuration: 0 },
    expected: { buildCommand: BUILD },
  },
];

export interface VercelArgsCase {
  argv: string[];
  expected: { include: string[]; maxDuration?: number };
}

export type VercelArgsRow = Case<VercelArgsCase>;

export const VERCEL_ARGS_CASES: VercelArgsRow[] = [
  { id: 'build2-vercel-args-default-to-nothing-extra', src: 'janux', argv: [], expected: { include: [] } },
  { id: 'build2-vercel-args-read-one-include', src: 'janux', argv: ['--include', 'content'], expected: { include: ['content'] } },
  { id: 'build2-vercel-args-collect-every-include-in-order', src: 'janux', argv: ['--include', 'content', '--include', 'data'], expected: { include: ['content', 'data'] } },
  { id: 'build2-vercel-args-ignore-an-include-with-nothing-after-it', src: 'janux', argv: ['--include'], expected: { include: [] } },
  { id: 'build2-vercel-args-read-a-max-duration', src: 'janux', argv: ['--max-duration', '60'], expected: { include: [], maxDuration: 60 } },
  { id: 'build2-vercel-args-drop-a-max-duration-that-is-not-a-number', src: 'janux', argv: ['--max-duration', 'soon'], expected: { include: [] } },
  { id: 'build2-vercel-args-drop-a-dangling-max-duration', src: 'janux', argv: ['--max-duration'], expected: { include: [] } },
  { id: 'build2-vercel-args-read-both-flags-together', src: 'janux', argv: ['--include', 'content', '--max-duration', '15'], expected: { include: ['content'], maxDuration: 15 } },
];

/** Re-exported so the runner does not import the adapters twice. */
export { parseVercelArgs, unsupportedFeatures, vercelConfig };
