import { unsupportedFeatures } from '../../janux-cli/src/adapter';
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
  capabilities: { websocket: boolean; streaming: boolean; filesystem: boolean };
  /** The feature each gap must name, in order. */
  gaps: string[];
}

export type CapabilityRow = Case<CapabilityCase>;

const WS = 'src/ws.ts';
const STREAM = 'streaming SSR';
const SPOOL = 'spoolMultipart()';

export const CAPABILITY_CASES: CapabilityRow[] = [
  {
    id: 'build2-target-that-can-do-everything-warns-about-nothing',
    src: 'janux',
    websocketModule: true,
    capabilities: { websocket: true, streaming: true, filesystem: true },
    gaps: [],
  },
  {
    id: 'build2-target-without-websockets-names-the-app-file-it-breaks',
    src: 'janux',
    websocketModule: true,
    capabilities: { websocket: false, streaming: true, filesystem: true },
    gaps: [WS],
  },
  {
    id: 'build2-an-app-with-no-websockets-hears-nothing-about-them',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: false, streaming: true, filesystem: true },
    gaps: [],
  },
  {
    id: 'build2-a-buffering-target-says-so-whatever-the-app-does',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: true, streaming: false, filesystem: true },
    gaps: [STREAM],
  },
  {
    id: 'build2-a-read-only-target-names-the-upload-primitive',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: true, streaming: true, filesystem: false },
    gaps: [SPOOL],
  },
  {
    id: 'build2-every-gap-is-reported-in-one-pass',
    src: 'janux',
    websocketModule: true,
    capabilities: { websocket: false, streaming: false, filesystem: false },
    gaps: [WS, STREAM, SPOOL],
  },
  {
    id: 'build2-streaming-and-uploads-are-reported-without-a-websocket-module',
    src: 'janux',
    websocketModule: false,
    capabilities: { websocket: true, streaming: false, filesystem: false },
    gaps: [STREAM, SPOOL],
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
