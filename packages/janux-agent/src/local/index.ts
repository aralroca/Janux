/**
 * `@janux/agent/local` — the browser-side copilot runtime.
 *
 * The agent loop runs in the page (via `@aralroca/gui-agent`) against the
 * app's own tools; the model is pluggable: `localLlm()` runs an open-source
 * model on the visitor's machine (WebGPU), `serverLlm()` keeps it server-side.
 */
export { createCopilot, type Copilot, type CopilotOptions } from './copilot';
export {
  DEFAULT_LOCAL_MODEL,
  localLlm,
  serverLlm,
  supportsLocalLlm,
  type ChunkListener,
  type LocalLlm,
  type LocalLlmOptions,
  type ServerLlmOptions,
  type StreamingLlm,
  type UIMessageChunk,
} from './llm';
export { defineTool, registry } from '@aralroca/gui-agent';
export type {
  AgentStep,
  Confirm,
  Llm,
  LlmRequest,
  LlmResponse,
  RunResult,
  ToolDefinition,
} from '@aralroca/gui-agent';
