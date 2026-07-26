// dedupe keeps a single gui-agent instance (one tool registry) even when the
// workspace install nests a second copy under @janux/agent. Pre-bundling the
// copilot runtime is the framework's job — `runtimeIncludes` in @janux/vite.
export default {
  resolve: { dedupe: ['@aralroca/gui-agent', 'ai'] },
};
