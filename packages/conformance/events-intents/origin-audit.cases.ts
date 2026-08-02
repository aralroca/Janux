import { jsx } from 'janux';
import { int, schema, str } from 'janux/types';
import type { AuditEntry } from '../../janux/src/runtime/intents';
import type { IntentRef } from '../../janux/src/define/types';
import { attempt, type ScenarioCase } from '../support/scenario';
import { act, fire, island, listenDoc, serve, settle, text } from './harness';

/**
 * Who asked: a human event or an agent call, and what the page can observe
 * about it.
 *
 * Janux is the only surface where the same intent is reachable both ways, so
 * origin is not decoration — it is what a guard branches on, what the audit
 * trail records, and what tells an activity indicator that a *human* did
 * something rather than an agent.
 */

type Refs = Record<string, IntentRef & ((input?: unknown) => Promise<unknown>)>;

/** A counter island whose intent is reachable from a click and from the bridge. */
function counter(guard?: 'auto' | 'confirm' | 'forbidden') {
  return island({
    state: schema({ n: int().default(0) }),
    intents: { bump: act({ ...(guard ? { guard } : {}), run: ({ state }) => ((state as { n: number }).n += 1) }) },
    view: ({ state, intents }) =>
      jsx('button', { class: 'b', onClick: (intents as Refs).bump, children: `n=${(state as { n: number }).n}` }),
  });
}

/** `janux:tool-call` as `tool:phase:guard[:approval]`. */
function toolEvents(log: string[]): () => void {
  return listenDoc('janux:tool-call', (detail) => {
    const event = detail as unknown as { tool: string; phase: string; guard?: string; approval?: boolean };

    log.push(`${event.tool}:${event.phase}:${event.guard ?? '-'}${event.approval ? ':approval' : ''}`);
  });
}

export const ORIGIN_AUDIT_CASES: ScenarioCase[] = [
  // ── origin attribution ─────────────────────────────────────────────────────
  {
    id: 'intent-a-dom-event-runs-the-intent-on-behalf-of-a-human',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: ({ origin }) => log.push(`origin:${origin}`) }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
    },
    expected: ['origin:human'],
  },
  {
    id: 'intent-a-bridge-call-runs-the-same-intent-as-an-agent',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: ({ origin }) => log.push(`origin:${origin}`) }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      await client.call('w.go');
    },
    expected: ['origin:agent'],
  },
  {
    id: 'intent-origin-is-per-invocation-not-per-island',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: ({ origin }) => log.push(origin) }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
      await client.call('w.go');
      fire('.b', 'click');
      await settle(client);
    },
    expected: ['human', 'agent', 'human'],
  },
  {
    id: 'intent-a-forbidden-intent-is-still-a-button-a-human-can-press',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('forbidden'));

      fire('.b', 'click');
      await settle(client);
      log.push(`dom:${text('.b')}`);
      await attempt(log, 'agent', () => client.call('w.bump'));
    },
    expected: ['dom:n=1', 'agent:threw:Intent "w.bump" is not available'],
  },
  {
    id: 'intent-a-confirm-intent-runs-on-a-click-and-only-proposes-for-an-agent',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));

      fire('.b', 'click');
      await settle(client);
      log.push(`click:${text('.b')}`);
      const proposal = (await client.call('w.bump')) as { status: string };

      log.push(`agent:${proposal.status}`, `dom:${text('.b')}`);
    },
    expected: ['click:n=1', 'agent:proposal', 'dom:n=1'],
  },
  {
    id: 'intent-effects-and-lifecycle-run-on-behalf-of-the-human-session',
    src: 'janux',
    run: async (log) => {
      const def = island({
        lifecycle: { attach: ({ origin }) => void log.push(`attach:${origin}`) },
        intents: { go: act({ run: () => undefined }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
    },
    expected: ['attach:human'],
  },

  // ── the activity channel ───────────────────────────────────────────────────
  {
    id: 'intent-a-human-click-emits-no-agent-activity-events',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());
      const stop = toolEvents(log);

      fire('.b', 'click');
      await settle(client);
      stop();
      log.push(`dom:${text('.b')}`);
    },
    expected: ['dom:n=1'],
  },
  {
    id: 'intent-an-agent-call-announces-itself-before-and-after-it-runs',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());
      const stop = toolEvents(log);

      await client.call('w.bump');
      stop();
    },
    expected: ['w.bump:start:auto', 'w.bump:ok:auto'],
  },
  {
    id: 'intent-an-agent-call-that-fails-announces-the-failure-phase',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { boom: act({ run: () => { throw new Error('declined'); } }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).boom }),
      });
      const { client } = await serve(def);
      const stop = toolEvents(log);

      await attempt(log, 'call', () => client.call('w.boom'));
      stop();
    },
    expected: ['w.boom:start:auto', 'w.boom:error:auto', 'call:threw:declined'],
  },
  {
    id: 'intent-a-refused-agent-call-announces-the-guard-that-refused-it',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('forbidden'));
      const stop = toolEvents(log);

      await attempt(log, 'call', () => client.call('w.bump'));
      stop();
    },
    expected: ['w.bump:start:forbidden', 'w.bump:error:forbidden', 'call:threw:Intent "w.bump" is not available'],
  },
  {
    id: 'intent-a-proposal-is-announced-as-its-own-phase-not-as-a-success',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));
      const stop = toolEvents(log);

      await client.call('w.bump');
      stop();
    },
    expected: ['w.bump:start:confirm', 'w.bump:proposal:confirm'],
  },
  {
    id: 'intent-an-approval-is-announced-as-the-execution-it-is',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));
      const proposal = (await client.call('w.bump')) as { id: string };
      const stop = toolEvents(log);

      await client.approve(proposal.id);
      stop();
      log.push(`dom:${text('.b')}`);
    },
    expected: ['w.bump:start:confirm:approval', 'w.bump:ok:confirm:approval', 'dom:n=1'],
  },
  {
    id: 'intent-a-proposal-reaches-the-page-as-a-dom-event-too',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));
      const stop = listenDoc('janux:proposal', (detail) => log.push(`proposal:${(detail as unknown as { tool: string }).tool}`));

      await client.call('w.bump');
      stop();
    },
    expected: ['proposal:w.bump'],
  },
  {
    id: 'intent-a-rejected-proposal-cannot-be-approved-afterwards',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));
      const proposal = (await client.call('w.bump')) as { id: string };

      log.push(`rejected:${client.reject(proposal.id)}`, `again:${client.reject(proposal.id)}`);
      await client
        .approve(proposal.id)
        .catch((error: unknown) => log.push(`approve:${(error as Error).message.replace(proposal.id, '<id>')}`));
      log.push(`dom:${text('.b')}`);
    },
    expected: ['rejected:true', 'again:false', 'approve:Janux: unknown proposal "<id>"', 'dom:n=0'],
  },
  {
    id: 'intent-approving-twice-runs-the-intent-once',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));
      const proposal = (await client.call('w.bump')) as { id: string };

      await client.approve(proposal.id);
      await client
        .approve(proposal.id)
        .catch((error: unknown) => log.push(`second:${(error as Error).message.replace(proposal.id, '<id>')}`));
      log.push(`dom:${text('.b')}`);
    },
    expected: ['second:Janux: unknown proposal "<id>"', 'dom:n=1'],
  },
  {
    id: 'intent-an-unknown-tool-name-is-refused-by-the-bridge',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      await attempt(log, 'call', () => client.call('w.nosuch'));
    },
    expected: ['call:threw:Janux: unknown tool "w.nosuch"'],
  },
  {
    id: 'intent-a-tool-name-with-a-suffix-is-not-the-tool-it-starts-with',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      await attempt(log, 'call', () => client.call('w.bump.extra'));
      log.push(`dom:${text('.b')}`);
    },
    expected: ['call:threw:Janux: malformed tool name "w.bump.extra" — expected "component.intent"', 'dom:n=0'],
  },
  {
    id: 'intent-a-tool-name-without-a-component-half-is-refused',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      await attempt(log, 'call', () => client.call('.bump'));
    },
    expected: ['call:threw:Janux: malformed tool name ".bump" — expected "component.intent"'],
  },
  {
    id: 'intent-calling-an-island-the-page-does-not-show-has-no-surface-to-reach',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      await attempt(log, 'call', () => client.call('ghost.bump'));
    },
    expected: ['call:threw:Janux: no mounted surface for "ghost"'],
  },

  // ── the audit trail on a live page ─────────────────────────────────────────
  {
    id: 'intent-a-click-is-audited-with-the-human-origin',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const { client } = await serve(counter(), { onAudit: (entry) => entries.push(entry as AuditEntry) });

      fire('.b', 'click');
      await settle(client);
      log.push(`${entries[0]!.tool}:${entries[0]!.origin}:${entries[0]!.ok}`);
    },
    expected: ['w.bump:human:true'],
  },
  {
    id: 'intent-an-agent-call-is-audited-with-the-agent-origin',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const { client } = await serve(counter(), { onAudit: (entry) => entries.push(entry as AuditEntry) });

      await client.call('w.bump');
      log.push(`${entries[0]!.tool}:${entries[0]!.origin}:${entries[0]!.ok}`);
    },
    expected: ['w.bump:agent:true'],
  },
  {
    id: 'intent-every-audit-entry-is-mirrored-as-a-dom-event-for-an-audit-island-to-subscribe-to',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());
      const stop = listenDoc('janux:audit', (detail) => {
        const entry = detail as unknown as AuditEntry;

        log.push(`${entry.tool}:${entry.origin}`);
      });

      fire('.b', 'click');
      await settle(client);
      await client.call('w.bump');
      stop();
    },
    expected: ['w.bump:human', 'w.bump:agent'],
  },
  {
    id: 'intent-the-audit-trail-records-a-mixed-human-and-agent-session-in-order',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());
      const stop = listenDoc('janux:audit', (detail) => log.push((detail as unknown as AuditEntry).origin));

      fire('.b', 'click');
      await settle(client);
      await client.call('w.bump');
      fire('.b', 'click');
      await settle(client);
      stop();
      log.push(`dom:${text('.b')}`);
    },
    expected: ['human', 'agent', 'human', 'dom:n=3'],
  },
  {
    id: 'intent-a-refused-agent-call-leaves-a-failed-entry-in-the-trail',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const { client } = await serve(counter('forbidden'), { onAudit: (entry) => entries.push(entry as AuditEntry) });

      await attempt(log, 'call', () => client.call('w.bump'));
      log.push(`${entries[0]!.origin}:${entries[0]!.guard}:${entries[0]!.ok}`);
    },
    expected: ['call:threw:Intent "w.bump" is not available', 'agent:forbidden:false'],
  },
  {
    id: 'intent-a-proposal-is-recorded-as-proposed-rather-than-as-a-success',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const { client } = await serve(counter('confirm'), { onAudit: (entry) => entries.push(entry as AuditEntry) });

      await client.call('w.bump');
      log.push(`${entries[0]!.ok}:${entries[0]!.proposed === true}`, `count:${entries.length}`);
    },
    expected: ['true:true', 'count:1'],
  },
  {
    id: 'intent-approving-adds-the-execution-entry-the-proposal-could-not-promise',
    src: 'janux',
    run: async (log) => {
      const entries: AuditEntry[] = [];
      const { client } = await serve(counter('confirm'), { onAudit: (entry) => entries.push(entry as AuditEntry) });
      const proposal = (await client.call('w.bump')) as { id: string };

      await client.approve(proposal.id);
      log.push(entries.map((entry) => `${entry.ok}:${entry.proposed === true}`).join('|'));
    },
    expected: ['true:true|true:false'],
  },

  // ── reading the surface back ───────────────────────────────────────────────
  {
    id: 'intent-reading-an-island-mounts-it-and-answers-with-its-resource',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());
      const resource = (await client.read('ui://w#default')) as { uri: string; state: unknown; sync: string };

      log.push(`${resource.uri}:${JSON.stringify(resource.state)}:${resource.sync}`);
    },
    expected: ['ui://w#default:{"n":0}:idle'],
  },
  {
    id: 'intent-a-read-after-a-click-shows-the-state-the-click-produced',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      fire('.b', 'click');
      await settle(client);
      log.push(JSON.stringify(((await client.read('ui://w#default')) as { state: unknown }).state));
    },
    expected: ['{"n":1}'],
  },
  {
    id: 'intent-the-manifest-announces-the-mounted-islands-intents-with-their-guards',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter('confirm'));

      await client.read('ui://w#default');
      const manifest = client.manifest() as unknown as { tools: { name: string; guard: string }[] };

      log.push(manifest.tools.map((tool) => `${tool.name}:${tool.guard}`).join(','));
    },
    expected: ['w.bump:confirm'],
  },
  {
    id: 'intent-an-island-nobody-has-interacted-with-is-not-in-the-manifest-yet',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());
      const manifest = client.manifest() as unknown as { tools: unknown[] };

      log.push(`tools:${manifest.tools.length}`);
    },
    expected: ['tools:0'],
  },
  {
    id: 'intent-a-click-is-what-puts-an-island-on-the-agent-surface',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      fire('.b', 'click');
      await settle(client);
      log.push(`tools:${(client.manifest() as unknown as { tools: unknown[] }).tools.length}`);
    },
    expected: ['tools:1'],
  },
  {
    id: 'intent-subscribing-to-an-event-hears-what-a-click-emitted',
    src: 'janux',
    run: async (log) => {
      const def = island({
        emits: { picked: schema({ id: str() }) },
        intents: { pick: act({ run: ({ emit }) => emit('picked', { id: 'x1' }) }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).pick }),
      });
      const { client } = await serve(def);

      client.subscribe('picked', (payload) => log.push(`heard:${JSON.stringify(payload)}`));
      fire('.b', 'click');
      await settle(client);
    },
    expected: ['heard:{"id":"x1"}'],
  },
  {
    id: 'intent-unsubscribing-stops-the-next-click-from-being-heard',
    src: 'janux',
    run: async (log) => {
      const def = island({
        emits: { picked: schema({ id: str() }) },
        intents: { pick: act({ run: ({ emit }) => emit('picked', { id: 'x1' }) }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).pick }),
      });
      const { client } = await serve(def);
      const stop = client.subscribe('picked', () => log.push('heard'));

      fire('.b', 'click');
      await settle(client);
      stop();
      fire('.b', 'click');
      await settle(client);
      log.push('done');
    },
    expected: ['heard', 'done'],
  },

  // ── settling a page an agent is driving ────────────────────────────────────
  {
    id: 'intent-settled-drains-the-work-a-click-started-before-it-answers',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        intents: {
          slow: act({
            run: async ({ state }) => {
              await new Promise((resolve) => setTimeout(resolve, 15));
              (state as { n: number }).n += 1;
            },
          }),
        },
        view: ({ state, intents }) =>
          jsx('button', { class: 'b', onClick: (intents as Refs).slow, children: `n=${(state as { n: number }).n}` }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      log.push(`immediately:${text('.b')}`);
      await settle(client);
      log.push(`settled:${text('.b')}`);
    },
    expected: ['immediately:n=0', 'settled:n=1'],
  },
  {
    id: 'intent-an-awaited-agent-call-already-sees-the-dom-it-changed',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        intents: {
          slow: act({
            run: async ({ state }) => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              (state as { n: number }).n = 7;
            },
          }),
        },
        view: ({ state }) => jsx('output', { children: `n=${(state as { n: number }).n}` }),
      });
      const { client } = await serve(def);

      await client.call('w.slow');
      log.push(text('output'));
    },
    expected: ['n=7'],
  },
  {
    id: 'intent-settled-scoped-to-one-island-still-answers-for-the-page-it-was-given',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      fire('.b', 'click');
      await client.settled('ui://w');
      log.push(text('.b'));
    },
    expected: ['n=1'],
  },
  {
    id: 'intent-settling-a-quiet-page-returns-without-mounting-anything',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(counter());

      await settle(client);
      log.push(`tools:${(client.manifest() as unknown as { tools: unknown[] }).tools.length}`);
    },
    expected: ['tools:0'],
  },
];
