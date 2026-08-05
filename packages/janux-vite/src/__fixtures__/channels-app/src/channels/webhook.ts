import { defineChannel } from '@janux/agent';

export default defineChannel({
  receive: async (req) => ({ text: ((await req.json()) as { text: string }).text }),
  send: (reply) => Response.json(reply),
});
