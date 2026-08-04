---
title: Schedules and background jobs
description: "The cron trigger for durable workflows: a file per schedule, at-least-once execution leased through the store, and an adapter that declares how it fires."
---

# Schedules and background jobs

[Durable workflows](/docs/reference/agent-workflows) can survive a restart, but something has to *start* them. A schedule is that trigger: a file under `src/schedules/`, discovered the way routes are, run at-least-once, and leased through the same [storage adapter](/docs/reference/agent-memory) everything else in the harness uses.

```ts
import {
  defineSchedule,
  defineScheduleConfig,
  createScheduler,
  isValidCron,
  nextOccurrence,
} from '@janux/agent';
```

## The convention

```
src/schedules/
  _config.ts              ← which store backs the scheduler (optional)
  nightly-digest.ts       ← the schedule "nightly-digest"
  billing/invoice-sweep.ts ← the schedule "billing/invoice-sweep"
```

Every `.ts`/`.js` file default-exports `defineSchedule(...)` and **is named by its path**, so a rename is a rename and nothing else has to agree. Files starting with `_` are shared code, never schedules — which is what makes `_config.ts` and a `_helpers.ts` beside your schedules unremarkable.

```ts
import { defineSchedule } from '@janux/agent';
import { provisioning, provisioningRunner } from '../server/workflow';
import { storage } from './_config';

const runner = provisioningRunner(storage);

export default defineSchedule({
  cron: '*/5 * * * *',
  async run({ state, remember }) {
    const pending = (state as { runId?: string } | undefined)?.runId;

    if (pending) {
      await runner.resume(provisioning, pending, 'starter');
      await remember({});

      return;
    }
    const started = await runner.start(provisioning, { requestedBy: 'provision-sweep' });

    await remember({ runId: started.runId });
  },
});
```

`cron` is validated at **definition time**, so a typo is a boot failure rather than a job that silently never runs. Five fields (`minute hour day-of-month month day-of-week`) plus `@hourly`, `@daily`/`@midnight`, `@weekly`, `@monthly` and `@yearly`; `*`, `5`, `1-5`, `*/15`, `10-40/10`, lists, and names like `MON-FRI` or `JAN` all work, in the runtime's local timezone. `isValidCron(expr)` and `nextOccurrence(expr, after)` are the same parser, exported for your own checks. Valid means *will actually fire*: `0 0 30 2 *` parses perfectly and names a date the calendar never has, so it is rejected rather than accepted into a schedule that could only ever throw.

### The run bag

| Field | What it is |
|---|---|
| `name` | The schedule's path-derived name |
| `dueAt` | The instant this occurrence was **due** — not when it actually started |
| `state` | Whatever the previous run remembered. `undefined` on the first run |
| `remember(state)` | Persists handler memory *immediately*; it survives crashes and restarts |

`remember` is what turns at-least-once into something you can build on. A schedule that starts a durable run and remembers its `runId` **resumes** that run on the next occurrence instead of starting a second one — including after the process that started it was killed.

## Choosing the store

`src/schedules/_config.ts` picks the backend. Without it the scheduler keeps its state in memory, which is right for dev and wrong for anything with two instances.

```ts
import { defineScheduleConfig } from '@janux/agent';
import { durableStorage } from '../server/harness';

export const storage = await durableStorage();

export default defineScheduleConfig({ storage, tickMs: 30_000, leaseMs: 60_000 });
```

`tickMs` is how often this instance looks for due work; `leaseMs` is how long a claim stays exclusive before another instance may take it. Any store implementing `syncSchedules` / `claimDueSchedules` / `settleSchedule` / `saveScheduleState` works — [`createPgStorage`](/docs/reference/agent-memory) implements them, and so does `createMemoryStorage`.

## The guarantees

**At-least-once, deduplicated by lease.** A claim is an atomic lease on the store: two instances ticking on the same second cannot claim the same occurrence, and an instance that dies holding one has its claim reopen when the lease expires — so a crash mid-run means a re-run, never a lost run. Your handler is therefore expected to be safe to re-enter: `remember()` exists so it can be.

Some consequences worth stating outright:

- The next occurrence is computed from when a run **finished**, not when it started, so a run longer than its interval never settles onto an already-past time and re-fires immediately.
- A brand-new schedule is seeded from *now*, so it waits for its first real occurrence instead of firing the moment it is deployed.
- Changing a schedule's `cron` reseeds its clock; leaving it alone preserves the pending occurrence across restarts.
- A schedule deleted from disk is pruned from the store on the next boot.
- A handler that throws is recorded (`lastStatus`, `lastError`) and its clock still advances — one bad night does not wedge the schedule forever.

## How it fires — and where it doesn't

This is the part a deployment cannot paper over: **serverless has no persistent process**, so nothing can hold a tick loop. Each [adapter](/docs/recipes/adapters) declares what it can do through its `schedules` capability, and `janux build` says so out loud.

| Capability | What happens | Who declares it |
|---|---|---|
| `'process'` | The server ticks in-process, on `tickMs` | `janux dev`, `janux start`, [`@janux/node`](/docs/recipes/adapters) |
| `'http'` | The platform's cron POSTs `/_janux/schedules/tick` | [`@janux/vercel`](/docs/recipes/vercel) |
| `false` | Schedules cannot run at all; the build reports it as an unsupported feature | any target with neither |

Under the `http` trigger the endpoint is the trigger, so it is secret-gated: set `JANUX_CRON_SECRET` and have the platform send it as `Authorization: Bearer <secret>`. An unset secret answers `503 schedule_trigger_unconfigured` rather than ticking for whoever asks. `GET` and `POST` both tick, because platform schedulers differ on which they send — Vercel Cron uses `GET`.

On Vercel there is nothing else to wire: add a `crons` entry and set **`CRON_SECRET`**, the name Vercel already sends its bearer under and which Janux accepts when `JANUX_CRON_SECRET` is unset.

```json
{ "crons": [{ "path": "/_janux/schedules/tick", "schedule": "*/5 * * * *" }] }
```

The platform's cron decides *when to look*; your `cron` expressions still decide what is actually due, so a one-minute platform tick and a `@daily` schedule do the right thing between them.

## Running one yourself

`createScheduler` is the mount the framework builds for you — reach for it directly only in a custom server or a test.

```ts
import { createMemoryStorage, createScheduler, defineSchedule } from '@janux/agent';

const scheduler = createScheduler({
  storage: createMemoryStorage(),
  schedules: { sweep: defineSchedule({ cron: '@hourly', run: () => {} }) },
});

await scheduler.tick(); // claims and runs everything due right now → the names that ran
scheduler.start();      // the in-process loop
scheduler.stop();
```

Related: [Durable workflows](/docs/reference/agent-workflows) · [Agent memory & storage](/docs/reference/agent-memory) · [Adapters](/docs/recipes/adapters)
