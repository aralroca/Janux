import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { LlmRequest } from '@aralroca/gui-agent';
import {
  DEFAULT_LOCAL_MODEL,
  localLlm,
  probeLocalLlm,
  serverLlm,
  supportsLocalLlm,
  type LocalLlmProvider,
} from './llm';

const originalNavigator = globalThis.navigator;
const originalFetch = globalThis.fetch;

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  globalThis.fetch = originalFetch;
});

/** Each fake `gpu` is a fresh object, so the per-gpu probe cache never leaks across tests. */
function installGpu(gpu?: object): void {
  const value = gpu ? { gpu } : {};

  Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
}

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
  raw: undefined,
};

type Reply = { text?: string; toolCall?: { name: string; input: Record<string, unknown> } };

/** A provider with the same interface as `@browser-ai/transformers-js`, answering a script. */
function stubProvider(replies: Reply[]) {
  let turn = 0;
  const toContent = ({ text, toolCall }: Reply, index: number) =>
    toolCall
      ? [{ type: 'tool-call', toolCallId: `call-${index}`, toolName: toolCall.name, input: JSON.stringify(toolCall.input) }]
      : [{ type: 'text', text }];
  const model = {
    specificationVersion: 'v3',
    provider: 'stub',
    modelId: 'stub',
    supportedUrls: {},
    createSessionWithProgress: mock(async (onProgress: (fraction: number) => void) => {
      onProgress(0.5);
      onProgress(1);
    }),
    doGenerate: async () => {
      const index = Math.min(turn++, replies.length - 1);

      return {
        content: toContent(replies[index]!, index),
        finishReason: { unified: 'stop', raw: undefined },
        usage: USAGE,
        warnings: [],
      };
    },
  };
  const transformersJS = mock(() => model);

  return { provider: { transformersJS } as unknown as LocalLlmProvider, transformersJS, model };
}

const request = (tools: LlmRequest['tools'] = []): LlmRequest =>
  ({ messages: [{ role: 'user', content: 'add a task' }], tools }) as LlmRequest;

const ADD_TOOL = { name: 'tasks_add', description: 'Add a task', inputSchema: { type: 'object' } };

describe('supportsLocalLlm', () => {
  it('stays the sync fast-path: true iff navigator exposes gpu', () => {
    installGpu({});
    expect(supportsLocalLlm()).toBe(true);
    installGpu(undefined);
    expect(supportsLocalLlm()).toBe(false);
  });
});

describe('probeLocalLlm', () => {
  it('resolves false when there is no WebGPU at all', async () => {
    installGpu(undefined);
    expect(await probeLocalLlm()).toBe(false);
  });

  it('resolves true when requestAdapter hands back an adapter', async () => {
    installGpu({ requestAdapter: async () => ({}) });
    expect(await probeLocalLlm()).toBe(true);
  });

  it('resolves false when requestAdapter answers null (headless)', async () => {
    installGpu({ requestAdapter: async () => null });
    expect(await probeLocalLlm()).toBe(false);
  });

  it('resolves false when requestAdapter throws', async () => {
    installGpu({
      requestAdapter: async () => {
        throw new Error('no adapter');
      },
    });
    expect(await probeLocalLlm()).toBe(false);
  });

  it('resolves false when requestAdapter hangs past the timeout', async () => {
    installGpu({ requestAdapter: () => new Promise(() => {}) });
    expect(await probeLocalLlm({ timeoutMs: 20 })).toBe(false);
  });

  it('probes the adapter once per gpu and caches the verdict', async () => {
    const requestAdapter = mock(async () => ({}));

    installGpu({ requestAdapter });
    expect(await probeLocalLlm()).toBe(true);
    expect(await probeLocalLlm()).toBe(true);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });
});

describe('localLlm({ provider })', () => {
  it('runs a whole turn through the injected provider, no transformers-js import', async () => {
    const { provider, transformersJS } = stubProvider([{ text: 'Added it.' }]);
    const reply = await localLlm({ provider })(request());

    expect(reply.text).toBe('Added it.');
    expect(transformersJS).toHaveBeenCalledWith(DEFAULT_LOCAL_MODEL, { device: 'webgpu', dtype: 'q4f16' });
  });

  /**
   * Chat-template models (Qwen3 among them) emit their reasoning block and the
   * turn terminator as literal text. Rendered raw, a user reads
   * `<think> </think> Added it.<|im_end|>` — the model's stage directions.
   */
  it('strips reasoning blocks and chat-template markers from the answer', async () => {
    const noisy = '<think>\nThe user wants a task.\n</think> Added it.<|im_end|>';
    const { provider } = stubProvider([{ text: noisy }]);
    const reply = await localLlm({ provider })(request());

    expect(reply.text).toBe('Added it.');
  });

  it('keeps an answer that merely mentions the markers in prose', async () => {
    const { provider } = stubProvider([{ text: 'Write <think> in the doc.' }]);
    const reply = await localLlm({ provider })(request());

    expect(reply.text).toBe('Write <think> in the doc.');
  });

  it('maps the provider tool calls to gui-agent shape', async () => {
    const { provider } = stubProvider([{ toolCall: { name: 'tasks_add', input: { title: 'buy oat milk' } } }]);
    const reply = await localLlm({ provider })(request([ADD_TOOL]));

    expect(reply.toolCalls).toEqual([{ id: 'call-0', name: 'tasks_add', arguments: { title: 'buy oat milk' } }]);
  });

  it('load() reports progress and the session is created once for later turns', async () => {
    const { provider, model, transformersJS } = stubProvider([{ text: 'done' }]);
    const llm = localLlm({ provider });
    const fractions: number[] = [];

    await llm.load({ onProgress: (fraction) => fractions.push(fraction) });
    await llm(request());

    expect(fractions).toEqual([0.5, 1]);
    expect(model.createSessionWithProgress).toHaveBeenCalledTimes(1);
    expect(transformersJS).toHaveBeenCalledTimes(1);
  });

  it('forwards modelId, device and dtype to the provider', async () => {
    const { provider, transformersJS } = stubProvider([{ text: 'ok' }]);

    await localLlm({ provider, modelId: 'onnx-community/LFM2-1.2B-ONNX', device: 'wasm', dtype: 'q4' }).load();

    expect(transformersJS).toHaveBeenCalledWith('onnx-community/LFM2-1.2B-ONNX', { device: 'wasm', dtype: 'q4' });
  });
});

describe('serverLlm() without stream', () => {
  it("surfaces the mount's own words when it refuses (setup card, rate limit)", async () => {
    const refusals = [
      { status: 503, body: { type: 'setup', message: 'No model configured. Set JANUX_MODEL="provider/model".' } },
      { status: 429, body: { type: 'error', error: 'rate_limited', message: 'Too many questions right now.' } },
    ];

    for (const { status, body } of refusals) {
      globalThis.fetch = (async () => Response.json(body, { status })) as any;

      await expect(serverLlm()(request())).rejects.toThrow(body.message);
    }
  });

  it('falls back to the status when a refusal carries no message', async () => {
    globalThis.fetch = (async () => new Response('<html>502</html>', { status: 502 })) as any;

    await expect(serverLlm()(request())).rejects.toThrow('502');
  });

  it('returns the turn untouched when the mount answers', async () => {
    globalThis.fetch = (async () => Response.json({ text: 'hi', toolCalls: [] })) as any;

    const reply = await serverLlm()(request());

    expect(reply).toEqual({ text: 'hi', toolCalls: [] });
  });
});
