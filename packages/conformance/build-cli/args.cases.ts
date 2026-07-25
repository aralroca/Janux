import { parseArgs } from '@janux/cli';
// `auditManifest` is the core of `janux verify` but is not on the package's export
// surface, so the corpus reaches for it directly (see GAPS.md on this coupling).
import { auditManifest } from '../../janux-cli/src/verify';
import type { Case } from '../support/case';

/**
 * CLI argument parsing and the `verify` contract audit.
 *
 * Argument parsing is where a flag value gets mistaken for a positional and a
 * scenario file silently never runs. `verify` is the build gate for the agent
 * surface, so a tool it fails to flag ships undescribed.
 */
export interface ArgsCase {
  argv: string[];
  /** Only the fields the row is about. */
  expected: Partial<{
    command: string;
    port: number;
    files: string[];
    url: string;
    startCommand: string | undefined;
    json: boolean;
  }>;
}

export type ArgsRow = Case<ArgsCase>;

export const ARGS_CASES: ArgsRow[] = [
  // ── commands ────────────────────────────────────────────────────────────────
  { id: 'cli-parses-dev', src: 'janux', argv: ['dev'], expected: { command: 'dev' } },
  { id: 'cli-parses-build', src: 'janux', argv: ['build'], expected: { command: 'build' } },
  { id: 'cli-parses-start', src: 'janux', argv: ['start'], expected: { command: 'start' } },
  { id: 'cli-parses-verify', src: 'janux', argv: ['verify'], expected: { command: 'verify' } },
  { id: 'cli-parses-eval', src: 'janux', argv: ['eval'], expected: { command: 'eval' } },
  { id: 'cli-parses-help', src: 'janux', argv: ['help'], expected: { command: 'help' } },
  { id: 'cli-no-arguments-is-help', src: 'janux', argv: [], expected: { command: 'help' } },
  { id: 'cli-an-unknown-command-is-help', src: 'janux', argv: ['deploy'], expected: { command: 'help' } },
  { id: 'cli-a-flag-in-the-command-slot-is-help', src: 'janux', argv: ['--port', '4000'], expected: { command: 'help' } },
  { id: 'cli-commands-are-case-sensitive', src: 'janux', argv: ['DEV'], expected: { command: 'help' } },

  // ── port ────────────────────────────────────────────────────────────────────
  { id: 'cli-port-defaults-to-3000', src: 'janux', argv: ['dev'], expected: { port: 3000 } },
  { id: 'cli-port-is-read-from-the-flag', src: 'janux', argv: ['dev', '--port', '4321'], expected: { port: 4321 } },
  { id: 'cli-port-zero-is-honoured', src: 'janux', argv: ['dev', '--port', '0'], expected: { port: 0 } },
  { id: 'cli-port-flag-order-does-not-matter', src: 'janux', argv: ['--port', '4321', 'dev'], expected: { command: 'help', port: 4321 } },

  // ── positionals versus flag values ──────────────────────────────────────────
  { id: 'cli-eval-takes-file-positionals', src: 'janux', argv: ['eval', 'a.eval.json', 'b.eval.json'], expected: { files: ['a.eval.json', 'b.eval.json'] } },
  { id: 'cli-eval-with-no-files-is-empty', src: 'janux', argv: ['eval'], expected: { files: [] } },
  { id: 'cli-a-flag-value-is-not-a-positional', src: 'janux', argv: ['eval', '--port', '4000'], expected: { files: [] } },
  { id: 'cli-a-url-value-is-not-a-positional', src: 'janux', argv: ['eval', '--url', 'http://x'], expected: { files: [], url: 'http://x' } },
  { id: 'cli-a-start-value-is-not-a-positional', src: 'janux', argv: ['eval', '--start', 'janux start'], expected: { files: [], startCommand: 'janux start' } },
  { id: 'cli-files-and-flags-can-be-mixed', src: 'janux', argv: ['eval', 'a.json', '--url', 'http://x', 'b.json'], expected: { files: ['a.json', 'b.json'], url: 'http://x' } },
  { id: 'cli-the-command-itself-is-never-a-positional', src: 'janux', argv: ['eval', 'eval'], expected: { files: ['eval'] } },

  // ── url, start, json ────────────────────────────────────────────────────────
  { id: 'cli-url-defaults-to-localhost-3000', src: 'janux', argv: ['eval'], expected: { url: 'http://localhost:3000' } },
  { id: 'cli-start-is-absent-by-default', src: 'janux', argv: ['eval'], expected: { startCommand: undefined } },
  { id: 'cli-json-defaults-to-false', src: 'janux', argv: ['eval'], expected: { json: false } },
  { id: 'cli-json-is-a-boolean-flag', src: 'janux', argv: ['eval', '--json'], expected: { json: true } },
  { id: 'cli-json-can-precede-the-files', src: 'janux', argv: ['eval', '--json', 'a.json'], expected: { json: true, files: ['a.json'] } },
];

export interface AuditCase {
  tools: { name: string; description?: string; guard: string }[];
  /** Tool names the audit must flag, in order. */
  flagged: string[];
}

export type AuditRow = Case<AuditCase>;

export const AUDIT_CASES: AuditRow[] = [
  { id: 'verify-passes-a-described-tool', src: 'janux', tools: [{ name: 'a.b', description: 'Does a thing', guard: 'auto' }], flagged: [] },
  { id: 'verify-flags-a-tool-with-no-description', src: 'janux', tools: [{ name: 'a.b', guard: 'auto' }], flagged: ['a.b'] },
  { id: 'verify-flags-an-empty-description', src: 'janux', tools: [{ name: 'a.b', description: '', guard: 'auto' }], flagged: ['a.b'] },
  { id: 'verify-flags-a-confirm-guarded-tool-too', src: 'janux', tools: [{ name: 'a.pay', guard: 'confirm' }], flagged: ['a.pay'] },
  { id: 'verify-flags-every-offender', src: 'janux', tools: [{ name: 'a', guard: 'auto' }, { name: 'b', description: 'ok', guard: 'auto' }, { name: 'c', guard: 'auto' }], flagged: ['a', 'c'] },
  { id: 'verify-an-empty-manifest-has-nothing-to-flag', src: 'janux', tools: [], flagged: [] },
  { id: 'verify-a-whitespace-description-is-accepted', src: 'janux', tools: [{ name: 'a.b', description: ' ', guard: 'auto' }], flagged: [] },
];

/** Re-exported so the runner does not import the CLI twice. */
export { auditManifest, parseArgs };
