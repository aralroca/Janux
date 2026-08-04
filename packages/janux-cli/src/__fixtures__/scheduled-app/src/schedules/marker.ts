import { appendFileSync } from 'node:fs';

/**
 * Records every run to `JANUX_SCHEDULE_MARKER`. A build or a check that boots
 * the app must not leave a line here — in a real app this is the handler that
 * charges a card or emails a customer.
 */
export default {
  cron: '* * * * *',
  run: () => {
    const marker = process.env.JANUX_SCHEDULE_MARKER;

    if (marker) appendFileSync(marker, 'ran\n');
  },
};
