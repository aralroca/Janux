import { describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { int, schema, str } from '../schema';
import { createInstance } from './instance';
import type { AuditEntry, Proposal } from './intents';

const shopDef = () =>
  component({
    name: 'shop',
    state: schema({ paid: int(), note: str() }),
    intents: {
      // Reversible and unguarded: the ordinary case, which taint must not disturb.
      note: intent({ input: schema({ text: str() }), run: ({ state, input }) => (state.note = input.text) }),
      // Unguarded for the app's own callers, but money does not come back.
      pay: intent({ effect: 'irreversible', run: ({ state }) => (state.paid += 1) }),
      wipe: intent({ guard: 'confirm', effect: 'irreversible', run: ({ state }) => (state.paid = 0) }),
    },
    view: () => null,
  });

function harness() {
  const audit: AuditEntry[] = [];
  const proposals: Proposal[] = [];
  const instance = createInstance(shopDef(), {
    onAudit: (entry) => audit.push(entry),
    onProposal: (proposal) => proposals.push(proposal),
  });

  return { instance, audit, proposals };
}

describe('the invocation pipeline under taint', () => {
  it('an untainted human call is untouched', async () => {
    const { instance, audit, proposals } = harness();

    await instance.intents.pay!(undefined, { origin: 'human' });

    expect(instance.snapshot().paid).toBe(1);
    expect(proposals).toHaveLength(0);
    expect(audit.at(-1)).toMatchObject({ origin: 'human', guard: 'auto', ok: true });
  });

  it('an untainted agent call on an auto intent is untouched', async () => {
    const { instance, proposals } = harness();

    await instance.intents.pay!(undefined, { origin: 'agent' });

    expect(instance.snapshot().paid).toBe(1);
    expect(proposals).toHaveLength(0);
  });

  /** Rule 1. */
  it('a tainted chain cannot present itself as human', async () => {
    const { instance, audit } = harness();

    await instance.intents.note!({ text: 'hi' }, { origin: 'human', tainted: true });

    expect(audit.at(-1)).toMatchObject({ origin: 'agent', tainted: true });
  });

  it('a tainted chain sees agent origin inside the intent body', async () => {
    const seen: string[] = [];
    const def = component({
      name: 'probe',
      intents: { look: intent({ run: ({ origin }) => seen.push(origin) }) },
      view: () => null,
    });

    await createInstance(def).intents.look!(undefined, { origin: 'human', tainted: true });

    expect(seen).toEqual(['agent']);
  });

  /** Rule 2 — and the reason rule 1 has to come first: `confirm` only parks for an agent. */
  it('a tainted chain cannot run an irreversible auto intent — it parks for a human', async () => {
    const { instance, proposals, audit } = harness();

    const result: any = await instance.intents.pay!(undefined, { origin: 'human', tainted: true });

    expect(result.status).toBe('proposal');
    expect(instance.snapshot().paid).toBe(0);
    expect(proposals).toHaveLength(1);
    expect(audit.at(-1)).toMatchObject({ guard: 'confirm', proposed: true, tainted: true });
  });

  it('the parked call still runs once a human approves it', async () => {
    const { instance, proposals } = harness();

    await instance.intents.pay!(undefined, { origin: 'agent', tainted: true });
    await proposals[0]!.execute();

    expect(instance.snapshot().paid).toBe(1);
  });

  it('leaves a reversible intent unguarded even under taint', async () => {
    const { instance, proposals } = harness();

    await instance.intents.note!({ text: 'from a comment' }, { origin: 'agent', tainted: true });

    expect(instance.snapshot().note).toBe('from a comment');
    expect(proposals).toHaveLength(0);
  });

  /**
   * The proposal diff is computed by shadow-running the body. That is a
   * convenience for a human reviewer, and it must never be the reason an
   * irreversible body ran before anyone approved it.
   */
  it('never shadow-runs an irreversible body to compute the proposal diff', async () => {
    const ran: string[] = [];
    const def = component({
      name: 'wire',
      state: schema({ sent: int() }),
      intents: {
        send: intent({
          effect: 'irreversible',
          run: ({ state }) => {
            ran.push('body');
            state.sent += 1;
          },
        }),
      },
      view: () => null,
    });
    const proposals: Proposal[] = [];
    const instance = createInstance(def, { onProposal: (proposal) => proposals.push(proposal) });
    const result: any = await instance.intents.send!(undefined, { origin: 'agent', tainted: true });

    expect(result.status).toBe('proposal');
    expect(result.diff).toBeUndefined();
    expect(ran).toEqual([]);
  });

  it('never loosens a guard the author already set', async () => {
    const { instance, proposals } = harness();

    await instance.intents.wipe!(undefined, { origin: 'agent', tainted: true });

    expect(proposals).toHaveLength(1);
    expect(instance.snapshot().paid).toBe(0);
  });
});
