import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, isBuilt, startTestServer } from '@janux/testing';
import { appRoot } from './support/app';

/**
 * examples/with-skills proves the two halves of the skills contract end to end
 * against the real app: the index is everywhere and the body is nowhere until
 * it is asked for, and `janux verify` refuses a procedure that names a tool the
 * mounted tree does not have.
 */

const EXAMPLE = appRoot('examples/with-skills');
const CLI_TIMEOUT = 120_000;
const BUILT = isBuilt(EXAMPLE);
const LIE = join(EXAMPLE, 'src/skills/lies.md');

let BASE = '';
let stop: (() => void) | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(EXAMPLE));
});

afterAll(() => {
  stop?.();
  rmSync(LIE, { force: true });
});

interface CliRun {
  code: number;
  /** Under `--json` the report owns stdout, so it is parsed on its own. */
  stdout: string;
  stderr: string;
}

function runJanux(args: string[]): CliRun {
  const proc = Bun.spawnSync(['bunx', 'janux', ...args], { cwd: EXAMPLE, stdout: 'pipe', stderr: 'pipe' });

  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

async function rpc(method: string, params?: unknown) {
  const res = await fetch(`${BASE}/_janux/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  return (await res.json()) as any;
}

describe('examples/with-skills — the index travels, the body is fetched', () => {
  it(
    'every route manifest carries the index and none of it carries a body',
    async () => {
      const app = await createTestApp(EXAMPLE);
      const manifest: any = await (await app.fetch('/_janux/manifest?path=/')).json();

      expect(manifest.skills.map((skill: any) => skill.name)).toEqual(['process-return', 'reconcile-shelf']);
      expect(manifest.skills[0].when).toContain('wants to return something');
      // The rule the procedure exists to teach must not be in the always-on payload.
      expect(JSON.stringify(manifest)).not.toContain('policy code for the reason');
    },
    CLI_TIMEOUT,
  );

  it(
    'MCP lists skills as resources and reads one back as markdown',
    async () => {
      const listed = await rpc('resources/list');
      const skills = listed.result.resources.filter((resource: any) => resource.uri.startsWith('janux://skill/'));

      expect(skills.map((skill: any) => skill.uri)).toEqual([
        'janux://skill/process-return',
        'janux://skill/reconcile-shelf',
      ]);
      expect(skills[0].description).toContain('Use when:');
      expect(JSON.stringify(listed)).not.toContain('policy code for the reason');

      const read = await rpc('resources/read', { uri: 'janux://skill/process-return' });

      expect(read.result.contents[0].mimeType).toBe('text/markdown');
      expect(read.result.contents[0].text).toContain('policy code for the reason');
    },
    CLI_TIMEOUT,
  );

  it(
    'a skill nobody declared is -32602, not an empty body',
    async () => {
      const read = await rpc('resources/read', { uri: 'janux://skill/invented' });

      expect(read.error.code).toBe(-32602);
    },
    CLI_TIMEOUT,
  );
});

describe('examples/with-skills — janux verify holds the procedure to the tree', () => {
  it(
    'exits 0 and says how many skills it checked',
    () => {
      const run = runJanux(['verify']);

      expect(run.code).toBe(0);
      expect(run.stdout).toContain('2 skill(s) name only tools that exist');
    },
    CLI_TIMEOUT,
  );

  it(
    'exits 1 on a skill that names tools this app does not have — declared or merely written down',
    () => {
      copyFileSync(join(EXAMPLE, 'broken-skills/lies.md'), LIE);

      try {
        const run = runJanux(['verify']);

        expect(run.code).toBe(1);
        // The frontmatter declaration...
        expect(run.stdout).toContain('api.returns.reimburse');
        // ...and the prose, which is where a model would have read it.
        expect(run.stdout).toContain('returns-desk.escalate');
        expect(run.stdout).toContain('lies.md');
      } finally {
        rmSync(LIE, { force: true });
      }
    },
    CLI_TIMEOUT,
  );
});

describe('examples/with-skills — the procedure is what makes the task finish', () => {
  it(
    'janux eval replays both halves: the prescribed order settles, the guessed code does not',
    () => {
      const run = runJanux([
        'eval',
        '--json',
        '--start',
        'bunx janux start --port 4776',
        '--url',
        'http://localhost:4776',
      ]);
      const reports = JSON.parse(run.stdout);

      expect(run.code).toBe(0);
      expect(reports.map((report: any) => report.pass)).toEqual([true, true]);
      expect(reports.map((report: any) => report.name.split(':')[0])).toEqual([
        'the whole return, in the order the skill prescribes',
        'the same return, guessed instead of looked up, never settles',
      ]);
    },
    CLI_TIMEOUT,
  );

  it(
    'the model-backed eval is deliberately outside the CI glob, so a keyless run cannot read as a pass',
    () => {
      const run = runJanux(['eval', '--json', '--start', 'bunx janux start --port 4777', '--url', 'http://localhost:4777']);
      const reports = JSON.parse(run.stdout);

      expect(reports.map((report: any) => report.name)).not.toContain('the agent itself finishes the return after loading the skill');
    },
    CLI_TIMEOUT,
  );
});
