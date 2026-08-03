import { defineSchedule } from '@janux/agent';
import { provisioning, provisioningRunner } from '../server/workflow';
import { storage } from './_config';

/**
 * The cron trigger for the durable workflow. Each sweep either opens a
 * provisioning run — which suspends on its human question — or, if a previous
 * sweep left one pending, resolves it with the workspace's default plan. The
 * remembered run id is what survives crashes and restarts: a re-run resumes
 * the same run, it never starts a duplicate.
 */

interface SweepMemory {
  /** A run this sweep opened and has not yet resolved. */
  runId?: string;
  /** The last run this sweep drove to completion. */
  completed?: string;
}

const DEFAULT_PLAN = process.env.PROVISION_DEFAULT_PLAN ?? 'starter';
const runner = provisioningRunner(storage);

export default defineSchedule({
  cron: '*/5 * * * *',
  async run({ state, remember }) {
    const pending = (state as SweepMemory | undefined)?.runId;

    if (pending) {
      const finished = await runner.resume(provisioning, pending, DEFAULT_PLAN);

      await remember({ completed: finished.runId } satisfies SweepMemory);

      return;
    }
    const started = await runner.start(provisioning, { requestedBy: 'provision-sweep' });

    await remember({ runId: started.runId } satisfies SweepMemory);
  },
});
