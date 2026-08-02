import { afterAll, describe, expect } from 'bun:test';
import { api, createJanuxServer } from '@janux/server';
import { int, jsx, schema, str } from 'janux';
import { setOnError } from 'janux/observability';
import { runCases } from '../support/scenario';
import { HTTP_CASES, type HttpRow, type Step } from './http.cases';

/**
 * One fresh server per row — the proposal map is per server, and rows about
 * single-use ids would otherwise depend on each other's leftovers.
 *
 * Two lines can appear in the log. A step contributes `"<status> <body>"`, with
 * the volatile parts folded (a proposal's UUID becomes `<id>`, the manifest and
 * MCP bodies become the one fact the row is about). A step marked `recordEffects`
 * also contributes `side:<what the app actually did>` — because "refused" has to
 * mean *nothing ran*, not merely "answered 403".
 */
setOnError(() => undefined);
// The sink is global: left installed, it follows the process into every later
// file and makes "no app has registered one" false for whoever runs next.
afterAll(() => setOnError(undefined));

/** Everything the app did, in order. Reset per row. */
let effects: string[] = [];

function makeServer(): ReturnType<typeof createJanuxServer> {
  return createJanuxServer({
    routes: { '/': () => jsx('main', {}) },
    apis: {
      shop: {
        read: api({ description: 'Reads', input: schema({ q: str().default('all') }), run: ({ input }) => input }),
        boom: api({ description: 'Throws', run: () => { throw new Error('kaboom'); } }),
        badOutput: api({ description: 'Lies', output: schema({ n: int() }), run: () => ({ n: 'not an int' }) }),
        closed: api({ description: 'Closed', guard: 'forbidden', run: () => 'secret' }),
        refund: api({
          description: 'Refund. Irreversible.',
          guard: 'confirm',
          run: () => {
            effects.push('refund');

            return 'refunded';
          },
        }),
        transfer: api({
          description: 'Transfer. Irreversible.',
          guard: 'confirm',
          input: schema({ amount: int().default(1) }),
          run: ({ input }) => {
            effects.push('transfer');

            return `transferred ${(input as { amount: number }).amount}`;
          },
        }),
      },
    },
  });
}

const PROPOSAL_ID = /prop_api_[0-9a-f-]{36}/g;

/** The one fact a row about the manifest or MCP is asserting, folded out of a large body. */
function fold(step: Step, status: number, body: string, expected: string): string {
  if (expected.startsWith('200 tools=')) return `${status} tools=${[...body.matchAll(/"name":"(api\.[^"]+)"/g)].map((m) => m[1]).join(',')}`;
  if (expected.startsWith('200 omits=')) return `${status} omits=${body.includes('api.shop.closed') ? 'api.shop.closed present' : 'api.shop.closed'}`;
  if (expected.startsWith('200 body-has=')) {
    const needle = expected.slice('200 body-has='.length);

    return `${status} body-has=${body.includes(needle) ? needle : `MISSING in ${body.slice(0, 160)}`}`;
  }
  if (expected.startsWith('200 body-lacks=')) {
    const needle = expected.slice('200 body-lacks='.length);

    return `${status} body-lacks=${body.includes(needle) ? `PRESENT: ${needle}` : needle}`;
  }
  if (expected === '200 <proposal>' && body.includes('"status":"proposal"')) return '200 <proposal>';
  if (expected === '404 page') return status === 404 ? '404 page' : `${status} ${body}`;

  return `${status} ${body.replace(PROPOSAL_ID, '<id>')}`;
}

async function runStep(server: ReturnType<typeof createJanuxServer>, step: Step, expected: string, proposalId: string): Promise<[string, string]> {
  const body = step.withProposalId ? step.body?.replace('{id}', proposalId) : step.body;
  const request = new Request(`http://test${step.path}`, {
    method: step.method ?? 'POST',
    ...(body === undefined ? {} : { body }),
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://test', ...step.headers },
  });
  const response = await server.fetch(request);
  const text = await response.text();

  return [fold(step, response.status, text, expected), PROPOSAL_ID.exec(text)?.[0] ?? proposalId];
}

async function runRow(row: HttpRow): Promise<string[]> {
  const server = makeServer();
  const log: string[] = [];
  let proposalId = 'none';

  for (const [index, step] of row.steps.entries()) {
    PROPOSAL_ID.lastIndex = 0;
    const [line, nextId] = await runStep(server, step, row.expected[index] ?? '', proposalId);

    log.push(line);
    proposalId = nextId;
    if (step.recordEffects) log.push(`side:${effects.join(',')}`);
  }

  return log;
}

describe('the api HTTP surface', () =>
  runCases(HTTP_CASES, async (row) => {
    effects = [];

    expect(await runRow(row)).toEqual(row.expected);
  }));
