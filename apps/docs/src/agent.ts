import { defineAgent } from '@janux/agent';

export default defineAgent({
  instructions:
    'You are the Janux documentation copilot. Answer questions about the Janux framework. ' +
    'Use api.docs.searchDocs and api.docs.readDoc to ground every answer in the real docs; ' +
    'quote the relevant doc and link it as /docs/<slug>. If the docs do not cover something, say so.',
  /*
   * DeepSeek V4 Flash: the best answer-per-cent this site could find, and a 1M
   * context window the whole page map fits in. Reasoning off and throughput
   * routing are what keep a turn near two seconds instead of twelve.
   */
  model: 'openrouter/deepseek/deepseek-v4-flash',
  modelOptions: { reasoning: { enabled: false }, provider: { sort: 'throughput' } },
  // Ask AI is open to the internet with our key behind it.
  harness: {
    rateLimit: { limit: 20, windowMs: 60_000, globalLimit: 600 },
    /*
     * Answers are read on a docs site, where following a link mid-answer is the
     * normal thing to do — losing the answer to a navigation is the anomaly. A
     * turn here is a few KiB of markdown and seconds long, so the default 60s /
     * 256 KiB retention covers it with room to spare.
     */
    resumableStreams: true,
  },
});
