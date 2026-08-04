import { toJsonSchema, type GuardValue } from 'janux';
import type { ApiTool } from './api';
import type { Skill } from './skills';

/**
 * The A2A Agent Card (spec §4.4.1), derived — never written.
 *
 * A hand-written card is a second copy of the agent surface, and a second copy
 * drifts: the day a tool is renamed, or a guard closes, the file on disk still
 * advertises the old answer to every agent that reads it. So this is a pure
 * function of what the app already declared — the same `api()` tools the
 * manifest and `tools/list` project, filtered by the same `callableTools`, plus
 * the same `src/skills/**` procedures MCP serves as resources.
 *
 * @see https://a2a-protocol.org/latest/specification/
 */

/** The protocol version this card's interface speaks (`AgentInterface.protocolVersion`). */
export const A2A_PROTOCOL_VERSION = '1.0';

/**
 * The registered well-known URI (spec §14.3) and the suffix-less spelling, so
 * a client that learned the path either way finds the same card.
 */
export const AGENT_CARD_PATHS = ['/.well-known/agent-card.json', '/.well-known/agent-card'];

/**
 * A2A has no place for a tool's input schema: `AgentSkill` carries prose and
 * tags, because an A2A skill is normally addressed in natural language. A Janux
 * skill is a typed `api()` call, so the schema travels in the one slot the spec
 * reserves for exactly this — a declared extension (§4.6) — and the client is
 * told, in the card itself, how to spend it.
 */
export const TOOL_INVOCATION_EXTENSION = 'https://janux.build/a2a/tool-invocation/v1';

const HOW_TO_INVOKE =
  'Send one message whose single DataPart is {"skill": <skill id>, "input": <object>}. ' +
  'For a skill tagged "tool", `params.schemas[id]` is the JSON Schema its input is validated against, ' +
  'and a skill tagged "confirm" answers with an input-required task carrying a proposal a human settles. ' +
  'A skill tagged "procedure" takes no input and answers with its markdown body.';

const BEARER_NOTE = 'The same bearer token the MCP endpoint requires.';

/** Every id in one namespace: `module.fn` for tools, `skill:name` for procedures — so neither can shadow the other. */
export const PROCEDURE_PREFIX = 'skill:';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface AgentCardInput {
  name: string;
  /** What the app already says about itself (`llmsTxt.description`). */
  description?: string;
  /** Absolute URL of the A2A endpoint. */
  endpoint: string;
  /** Callable tools with their resolved guard — the output of `callableTools`. */
  tools: { tool: ApiTool; guard: GuardValue }[];
  skills: readonly Skill[];
  auth: boolean;
}

function toolSkill({ tool, guard }: { tool: ApiTool; guard: GuardValue }): AgentSkill {
  return { id: tool.name, name: tool.name, description: tool.description ?? '', tags: ['tool', guard] };
}

function procedureSkill(skill: Skill): AgentSkill {
  return {
    id: `${PROCEDURE_PREFIX}${skill.name}`,
    name: skill.name,
    description: skill.description,
    tags: ['procedure'],
    ...(skill.when ? { examples: [skill.when] } : {}),
  };
}

function inputSchemas(tools: AgentCardInput['tools']): Record<string, unknown> {
  return Object.fromEntries(
    tools.map(({ tool }) => [tool.name, tool.input ? toJsonSchema(tool.input) : { type: 'object', properties: {} }]),
  );
}

export function agentCard({ name, description, endpoint, tools, skills, auth }: AgentCardInput) {
  return {
    name,
    description: description ?? `The agent surface of ${name}.`,
    version: '1',
    supportedInterfaces: [{ url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }],
    capabilities: {
      // A stateless endpoint has no stream to keep open, nowhere to push to and
      // no second card to authenticate into. Claiming otherwise would be the
      // one lie a discovery document must never tell.
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [
        { uri: TOOL_INVOCATION_EXTENSION, description: HOW_TO_INVOKE, required: true, params: { schemas: inputSchemas(tools) } },
      ],
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [...tools.map(toolSkill), ...skills.map(procedureSkill)],
    ...(auth ? { securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: 'Bearer', description: BEARER_NOTE } } } } : {}),
  };
}
