import { parseArgs } from '@janux/cli';
import type { Case } from '../support/case';

/**
 * The argument parser at its edges.
 *
 * `parseArgs` has no schema and no library behind it: a flag is found by
 * scanning the array, and everything that is not a flag or a flag's value is a
 * file to run. That design is why the interesting cases are all about
 * confusion between the three roles — a value that looks like a flag, a flag
 * spelled with `=`, a separator that is neither. Getting one wrong is silent:
 * the scenario file simply never runs, or the dev server listens somewhere
 * nobody looks.
 */
export interface ArgsEdgeCase {
  argv: string[];
  /** Only the fields the row is about. */
  expected: Partial<{
    command: string;
    port: number;
    files: string[];
    url: string;
    startCommand: string | undefined;
    json: boolean;
    root: string;
  }>;
}

export type ArgsEdgeRow = Case<ArgsEdgeCase>;

export const ARGS_EDGE_CASES: ArgsEdgeRow[] = [
  // ── commands ────────────────────────────────────────────────────────────────
  { id: 'cli2-parses-info', src: 'janux', argv: ['info'], expected: { command: 'info' } },
  { id: 'cli2-an-empty-command-word-is-help', src: 'janux', argv: [''], expected: { command: 'help' } },
  { id: 'cli2-a-command-is-not-trimmed-before-it-is-matched', src: 'janux', argv: ['dev '], expected: { command: 'help' } },
  { id: 'cli2-help-as-a-flag-does-not-run-what-follows-it', src: 'janux', argv: ['--help', 'dev'], expected: { command: 'help', files: ['dev'] } },
  { id: 'cli2-positionals-are-collected-whatever-the-command', src: 'janux', argv: ['verify', 'x'], expected: { command: 'verify', files: ['x'] } },
  { id: 'cli2-echoes-back-the-root-it-was-given', src: 'janux', argv: ['dev'], expected: { root: '/app' } },

  // ── flags that are not flags ────────────────────────────────────────────────
  { id: 'cli2-an-equals-flag-is-neither-a-value-nor-a-positional', src: 'janux', argv: ['dev', '--port=4000'], expected: { port: 3000, files: [] } },
  { id: 'cli2-the-json-flag-is-matched-whole', src: 'janux', argv: ['eval', '--json=true'], expected: { json: false } },
  { id: 'cli2-an-unknown-long-flag-is-ignored-rather-than-run', src: 'janux', argv: ['eval', '--jsonx'], expected: { json: false, files: [] } },
  { id: 'cli2-a-short-flag-is-read-as-a-file', src: 'janux', argv: ['eval', '-p', '3'], expected: { files: ['-p', '3'] } },
  { id: 'cli2-the-double-dash-separator-is-dropped-and-what-follows-it-is-a-file', src: 'janux', argv: ['eval', '--', 'a.json'], expected: { files: ['a.json'] } },

  // ── repeated and dangling flags ─────────────────────────────────────────────
  { id: 'cli2-the-first-port-flag-wins', src: 'janux', argv: ['dev', '--port', '4000', '--port', '5000'], expected: { port: 4000 } },
  { id: 'cli2-the-first-url-flag-wins', src: 'janux', argv: ['eval', '--url', 'http://x', '--url', 'http://y'], expected: { url: 'http://x' } },
  { id: 'cli2-a-dangling-url-flag-falls-back-to-the-default', src: 'janux', argv: ['eval', '--url'], expected: { url: 'http://localhost:3000' } },
  { id: 'cli2-a-dangling-start-flag-leaves-no-start-command', src: 'janux', argv: ['eval', '--start'], expected: { startCommand: undefined } },

  // ── values that look like something else ────────────────────────────────────
  { id: 'cli2-a-flag-value-may-itself-look-like-a-flag', src: 'janux', argv: ['eval', '--url', '--json'], expected: { url: '--json', json: true } },
  { id: 'cli2-a-value-flag-swallows-a-command-word', src: 'janux', argv: ['eval', '--url', 'build'], expected: { url: 'build', files: [] } },
  { id: 'cli2-a-flag-inside-a-quoted-value-is-not-parsed', src: 'janux', argv: ['eval', '--start', 'bun run start --port 4000'], expected: { startCommand: 'bun run start --port 4000', port: 3000 } },
  { id: 'cli2-a-url-keeps-its-path-verbatim', src: 'janux', argv: ['eval', '--url', 'http://x/base/'], expected: { url: 'http://x/base/' } },

  // ── files ───────────────────────────────────────────────────────────────────
  { id: 'cli2-a-file-after-a-consumed-flag-value-is-still-a-file', src: 'janux', argv: ['eval', '--port', '4000', 'a.json'], expected: { files: ['a.json'], port: 4000 } },
  { id: 'cli2-a-file-named-twice-is-kept-twice', src: 'janux', argv: ['eval', 'a.json', 'a.json'], expected: { files: ['a.json', 'a.json'] } },
  { id: 'cli2-an-absolute-file-path-is-a-file', src: 'janux', argv: ['eval', '/tmp/a.eval.json'], expected: { files: ['/tmp/a.eval.json'] } },
  { id: 'cli2-the-json-flag-is-read-whatever-the-command', src: 'janux', argv: ['help', '--json'], expected: { command: 'help', json: true } },

  // ── ports ───────────────────────────────────────────────────────────────────
  { id: 'cli2-a-padded-port-is-trimmed-before-it-is-read', src: 'janux', argv: ['dev', '--port', ' 4000 '], expected: { port: 4000 } },
  { id: 'cli2-a-port-may-be-written-in-exponent-notation', src: 'janux', argv: ['start', '--port', '1e3'], expected: { port: 1000 } },
  { id: 'cli2-the-highest-tcp-port-is-allowed', src: 'janux', argv: ['dev', '--port', '65535'], expected: { port: 65535 } },
];

/**
 * A port that is not a port. The parser is the last place this can be caught
 * cheaply: `Bun.serve` and `server.listen` both fail later, from inside the
 * runtime, with a message about sockets rather than about the flag you typed.
 */
export interface PortErrorCase {
  argv: string[];
  /** Substring the thrown message must carry, so the flag is named in it. */
  says: string;
}

export type PortErrorRow = Case<PortErrorCase>;

export const PORT_ERROR_CASES: PortErrorRow[] = [
  { id: 'cli2-port-rejects-a-word', src: 'janux', argv: ['dev', '--port', 'abc'], says: '--port' },
  { id: 'cli2-port-rejects-a-fraction', src: 'janux', argv: ['dev', '--port', '3000.5'], says: '--port' },
  { id: 'cli2-port-rejects-a-negative-number', src: 'janux', argv: ['dev', '--port', '-1'], says: '--port' },
  { id: 'cli2-port-rejects-a-number-above-the-tcp-range', src: 'janux', argv: ['dev', '--port', '99999'], says: '--port' },
  { id: 'cli2-port-rejects-infinity-which-is-a-number-but-not-a-port', src: 'janux', argv: ['dev', '--port', 'Infinity'], says: '--port' },
];

/** Re-exported so the runner does not import the CLI twice. */
export { parseArgs };
