import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
// The page's own rule: agent pieces come from @janux/agent/local, never from gui-agent directly.
import {
  DEFAULT_LOCAL_MODEL,
  createCopilot,
  probeLocalLlm,
  registry,
  serverLlm,
  supportsLocalLlm,
} from '@janux/agent/local';
import { component, createInstance, intent, jsx, schema, str } from 'janux';
import { buildManifest } from 'janux/manifest';

/**
 * recipes/local-model-copilot.md, asserted where a test can reach: the feature
 * detection it gates on, the model id its table names, the mount `serverLlm()`
 * posts to, and the three things it promises `createCopilot` does for free —
 * bridge the manifest tools, annotate `confirm`, and register `navigate`.
 * (The model download itself is not something CI should do.)
 */

beforeAll(() => GlobalRegistrator.register({ url: 'https://app.test/docs/reference/cli' }));
afterAll(() => GlobalRegistrator.unregister());
afterEach(() => {
  registry.clear();
  delete (window as any).janux;
  delete (navigator as any).gpu;
});

const MANIFEST_TOOLS = [
  { name: 'cart.addItem', description: 'Add an item', guard: 'auto', input: { type: 'object' } },
  { name: 'cart.checkout', description: 'Place the order.', guard: 'confirm', input: { type: 'object' } },
];

function installBridge(): string[] {
  const calls: string[] = [];

  (window as any).janux = {
    manifest: () => ({ tools: MANIFEST_TOOLS }),
    call: async (name: string) => {
      calls.push(name);

      return { ok: true };
    },
  };

  return calls;
}

/** An Llm that asks for one tool call, then answers. */
function scriptedLlm(tool: string) {
  let turn = 0;

  return async () => {
    turn += 1;

    return turn === 1 ? { toolCalls: [{ id: 'c1', name: tool, input: {} }] } : { text: 'done' };
  };
}

describe('recipes/local-model-copilot.md', () => {
  it('the policy line gates on probeLocalLlm(): a real adapter, not just navigator.gpu', async () => {
    expect(supportsLocalLlm()).toBe(false);
    (navigator as any).gpu = {};
    expect(supportsLocalLlm()).toBe(true);
    // The headless trap the recipe warns about: gpu present, no usable adapter.
    expect(await probeLocalLlm()).toBe(false);
    (navigator as any).gpu = { requestAdapter: async () => ({}) };

    expect(await probeLocalLlm()).toBe(true);
  });

  it('names the model the code actually defaults to', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe('onnx-community/Qwen3-0.6B-ONNX');
  });

  it('serverLlm() posts a turn to the built-in /_janux/llm mount', async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];

    globalThis.fetch = (async (url: any) => {
      seen.push(String(url));

      return new Response('{"text":"hi"}', { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    await (serverLlm() as any)({ messages: [{ role: 'user', content: 'hi' }], tools: [] }).catch(() => undefined);
    globalThis.fetch = original;

    expect(seen[0]).toContain('/_janux/llm');
  });

  it('bridges manifest tools, annotates confirm, and registers navigate with zero authoring', async () => {
    const calls = installBridge();
    const copilot = createCopilot({ llm: scriptedLlm('cart_addItem') as any, instructions: 'help' });

    await copilot.ask('add one');

    expect(calls).toEqual(['cart.addItem']);
    expect(registry.get('cart_checkout')!.description).toContain('proposal a human must approve');
    expect(registry.has('navigate')).toBe(true);
    copilot.dispose();
  });

  it('forbidden tools never reach the copilot, because they never reach the manifest', async () => {
    const Locked = component({
      name: 'admin',
      state: schema({ status: str().default('idle') }),
      intents: {
        wipe: intent({ description: 'Wipe everything', guard: 'forbidden', run: () => undefined }),
        ping: intent({ description: 'Ping', run: () => undefined }),
      },
      view: () => jsx('p', {}),
    });
    const instance = createInstance(Locked);

    await instance.attach();
    const manifest: any = buildManifest([{ def: Locked, key: 'default', instance }] as any, {});

    expect(manifest.tools.map((tool: any) => tool.name)).toEqual(['admin.ping']);
  });
});
