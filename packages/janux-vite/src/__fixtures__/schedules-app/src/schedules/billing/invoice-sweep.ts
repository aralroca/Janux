import { defineSchedule } from '@janux/agent';

export default defineSchedule({
  cron: '@daily',
  run: () => {},
});
