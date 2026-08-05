import { describe, expect } from 'bun:test';
import { component, createInstance, fenceUntrusted, intent, jsx, schema, str, type Proposal } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { runCases } from '../support/scenario';
import {
  PROMPT_INJECTION_CASES,
  TAINT_FALSE_POSITIVE_CASES,
  type CleanFlowRow,
  type InjectionRow,
} from './prompt-injection.cases';

/**
 * The corpus runs against the real pipeline, not a model.
 *
 * A row's payload is carried into the turn exactly as its source would carry
 * it — fenced, because that is what the projection does — and then the tool
 * the payload is reaching for is invoked through the door under test. What is
 * asserted is what the pipeline did, which is the only part of this that can
 * be guaranteed.
 */

const AMOUNT = '9999';

/** The app under attack: one irreversible tool on each side, neither of them guarded by hand. */
const shopDef = (declares: boolean) =>
  component({
    name: 'shop',
    state: declares ? schema({ comment: str().untrusted() }) : schema({ comment: str() }),
    intents: {
      pay: intent({ effect: 'irreversible', input: schema({ amount: str() }), run: ({ input }) => `paid:${input.amount}` }),
      note: intent({ input: schema({ text: str() }), run: ({ input }) => `noted:${input.text}` }),
    },
    view: () => null,
  });

const payApi = api({
  effect: 'irreversible',
  input: schema({ amount: str() }),
  run: ({ input }) => ({ paid: input.amount }),
});

const server = createJanuxServer({
  routes: { '/': () => jsx(shopDef(true) as any, {}) },
  apis: { shop: { pay: payApi } },
});

const callApi = (input: unknown, headers: Record<string, string>) =>
  server
    .fetch(
      new Request('http://injected.test/_janux/api/shop.pay', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
      }),
    )
    .then((response) => response.json() as any);

/**
 * The payload rides in fenced, the way the projection hands it over. Reading
 * it is what taints the chain — and the row asserts the pipeline's answer, so
 * the text itself is never inspected by anything under test.
 */
function carry(row: InjectionRow): string {
  return fenceUntrusted(row.payload, { source: row.source, from: 'ui://shop' });
}

async function throughIntent(row: InjectionRow, log: string[]): Promise<void> {
  const parked: Proposal[] = [];
  const instance = createInstance(shopDef(true), {
    initial: { comment: carry(row) },
    onProposal: (proposal) => parked.push(proposal),
  });
  const result: any = await instance.intents.pay!({ amount: AMOUNT }, { origin: 'human', tainted: true });

  log.push(`ran:${result?.status === 'proposal' ? 'no' : 'yes'}`);
  log.push(`outcome:${result?.status ?? 'executed'}`);
  if (parked.length === 1) log.push(`approved:${(await parked[0]!.execute()) === `paid:${AMOUNT}` ? 'ran' : 'other'}`);
}

async function throughApi(row: InjectionRow, log: string[]): Promise<void> {
  // The carried payload is what made this chain untrusted; the transport says so.
  const body = await callApi({ amount: AMOUNT, note: carry(row) }, { 'x-janux-origin': 'agent', 'x-janux-tainted': '1' });
  const result = body.result;

  log.push(`ran:${result?.status === 'proposal' ? 'no' : 'yes'}`);
  log.push(`outcome:${result?.status ?? 'executed'}`);
  const settled = await server
    .fetch(
      new Request('http://injected.test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: result.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    )
    .then((response) => response.json() as any);

  log.push(`approved:${settled.result?.paid === AMOUNT ? 'ran' : 'other'}`);
}

describe('prompt injection: no payload reaches an irreversible tool unattended', () => {
  runCases(PROMPT_INJECTION_CASES, async (row) => {
    const log: string[] = [];

    await (row.via === 'intent' ? throughIntent(row, log) : throughApi(row, log));

    expect(log).toEqual(row.expected);
  });
});

async function cleanFlow(row: CleanFlowRow, log: string[]): Promise<void> {
  const instance = createInstance(shopDef(row.declares), { initial: { comment: 'a perfectly ordinary comment' } });
  const invoke = row.irreversible
    ? instance.intents.pay!({ amount: '10' }, { origin: row.origin })
    : instance.intents.note!({ text: 'hi' }, { origin: row.origin });
  const result: any = await invoke;

  log.push(`ran:${result?.status === 'proposal' ? 'no' : 'yes'}`);
}

describe('prompt injection: the ordinary flow is untouched', () => {
  runCases(TAINT_FALSE_POSITIVE_CASES, async (row) => {
    const log: string[] = [];

    await cleanFlow(row, log);

    expect(log).toEqual(row.expected);
  });
});
