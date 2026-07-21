import type { ResolvedModel } from './model';

export interface AgentTool {
  name: string;
  description?: string;
  input?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ProviderReply {
  text: string;
  toolCalls: ToolCall[];
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function anthropicMessages(messages: ChatMessage[]): unknown[] {
  return messages.reduce<any[]>((acc, message) => {
    if (message.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content };
      const last = acc.at(-1);
      const lastIsToolResults =
        last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result';

      lastIsToolResults ? last.content.push(block) : acc.push({ role: 'user', content: [block] });

      return acc;
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      acc.push({
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.input })),
        ],
      });

      return acc;
    }
    acc.push({ role: message.role, content: message.content });

    return acc;
  }, []);
}

async function callAnthropic(
  model: ResolvedModel,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[],
  fetchImpl: FetchLike,
): Promise<ProviderReply> {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': model.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: 4096,
      system,
      messages: anthropicMessages(messages),
      tools: tools.map((tool) => ({
        name: tool.name.replace(/\./g, '__'),
        description: tool.description ?? '',
        input_schema: tool.input ?? { type: 'object', properties: {} },
      })),
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  const body: any = await response.json();
  const blocks: any[] = body.content ?? [];

  return {
    text: blocks.filter((block) => block.type === 'text').map((block) => block.text).join(''),
    toolCalls: blocks
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({ id: block.id, name: block.name.replace(/__/g, '.'), input: block.input })),
  };
}

const OPENAI_COMPAT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

async function callOpenAi(
  model: ResolvedModel,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[],
  fetchImpl: FetchLike,
): Promise<ProviderReply> {
  const response = await fetchImpl(OPENAI_COMPAT_URLS[model.provider]!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` },
    body: JSON.stringify({
      model: model.model,
      messages: [
        { role: 'system', content: system },
        ...messages.map((message) => openAiMessage(message)),
      ],
      tools: tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name.replace(/\./g, '__'), description: tool.description ?? '', parameters: tool.input ?? {} },
      })),
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const body: any = await response.json();
  const choice = body.choices?.[0]?.message ?? {};

  return {
    text: choice.content ?? '',
    toolCalls: (choice.tool_calls ?? []).map((call: any) => ({
      id: call.id,
      name: call.function.name.replace(/__/g, '.'),
      input: JSON.parse(call.function.arguments || '{}'),
    })),
  };
}

function openAiMessage(message: ChatMessage): unknown {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name.replace(/\./g, '__'), arguments: JSON.stringify(call.input ?? {}) },
      })),
    };
  }

  return { role: message.role, content: message.content };
}

/** Routes a chat turn to the resolved provider. Google reuses the OpenAI-compatible endpoint. */
export async function callProvider(
  model: ResolvedModel,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[],
  fetchImpl: FetchLike,
): Promise<ProviderReply> {
  if (model.provider === 'anthropic') return callAnthropic(model, system, messages, tools, fetchImpl);

  return callOpenAi(model, system, messages, tools, fetchImpl);
}
