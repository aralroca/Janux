import { defineChannel } from '@janux/agent';
import { GREETING } from '../_helpers';

export default defineChannel({
  receive: () => ({ text: GREETING }),
  send: (reply) => Response.json(reply),
});
