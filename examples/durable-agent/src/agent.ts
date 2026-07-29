import { defineAgent } from '@janux/agent';
import { buildHarness } from './server/harness';

export default defineAgent({
  instructions:
    'You are the workspace copilot of a durable Janux deployment. ' +
    'Conversations persist across restarts: users can leave and resume the same thread later. ' +
    'Workspace provisioning is a durable workflow — collect the plan, then activate.',
  harness: await buildHarness(),
});
