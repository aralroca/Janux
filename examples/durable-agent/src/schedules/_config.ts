import { defineScheduleConfig } from '@janux/agent';
import { durableStorage } from '../server/harness';

/** One storage for the whole scheduling side: the same durable adapter the harness uses. */
export const storage = await durableStorage();

const envInt = (name: string) => (process.env[name] ? Number(process.env[name]) : undefined);

export default defineScheduleConfig({
  storage,
  // Ops knobs: how often this instance polls for due work, and how long a
  // crashed instance's claim stays exclusive before another may pick it up.
  tickMs: envInt('SCHEDULE_TICK_MS'),
  leaseMs: envInt('SCHEDULE_LEASE_MS'),
});
