// The Ask AI runtime is reached via dynamic import on first click; without
// pre-bundling, dev-mode Vite discovers it lazily and 504s that first attempt.
// dedupe keeps a single gui-agent instance (one tool registry) even when the
// workspace install nests a second copy under @janux/agent.
export default {
  optimizeDeps: { include: ['@browser-ai/transformers-js', '@aralroca/gui-agent', '@aralroca/gui-agent/ai-sdk', 'ai'] },
  resolve: { dedupe: ['@aralroca/gui-agent', 'ai'] },
};
