import { defineSchedule } from '@janux/agent';

export const runs: Date[] = [];

export default defineSchedule({
  cron: '0 3 * * *',
  run({ dueAt }) {
    runs.push(dueAt);
  },
});
