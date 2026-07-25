import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import type { LlmRequest, LlmResponse } from '@aralroca/gui-agent';

// Registered before gui-agent is loaded, not in `beforeAll`: its bundled WebMCP
// polyfill resolves `class extends EventTarget` when its module body evaluates.
// Import it first and it subclasses Bun's native EventTarget, which then
// rejects every Happy-DOM Event — so `dispatchEvent` throws internally and the
// toolchange path silently never runs under test.
GlobalRegistrator.register({ url: 'https://app.test/' });

const { registry } = await import('@aralroca/gui-agent');
const { createCopilot } = await import('./copilot');

afterAll(() => GlobalRegistrator.unregister());
afterEach(() => {
  registry.clear();
  delete (window as any).janux;
});

const MANIFEST_TOOLS = [
  { name: 'cart.addItem', description: 'Add an item', guard: 'confirm', input: { type: 'object' } },
  { name: 'api.docs.searchDocs', description: 'Search docs', guard: 'auto', input: { type: 'object' } },
];

function installBridge(): ReturnType<typeof mock> {
  const call = mock(async () => ({ ok: true }));

  (window as any).janux = { manifest: () => ({ tools: MANIFEST_TOOLS }), call };

  return call;
}

/** An Llm that requests `calls` on its first turn and answers "done" on the next. */
function scriptedLlm(calls: LlmResponse['toolCalls']): { llm: (request: LlmRequest) => Promise<LlmResponse>; seen: LlmRequest[] } {
  const seen: LlmRequest[] = [];
  const llm = async (request: LlmRequest): Promise<LlmResponse> => {
    seen.push(request);

    return seen.length === 1 ? { toolCalls: calls } : { text: 'done' };
  };

  return { llm, seen };
}

describe('createCopilot', () => {
  it('exposes sanitized manifest tools to the model and routes calls through the bridge', async () => {
    const call = installBridge();
    const { llm, seen } = scriptedLlm([{ id: '1', name: 'cart_addItem', arguments: { sku: 'a' } }]);
    const copilot = createCopilot({ llm });
    const result = await copilot.ask('add item a');

    expect(seen[0]!.tools.map((tool) => tool.name)).toEqual(['cart_addItem', 'api_docs_searchDocs', 'navigate']);
    expect(seen[0]!.tools[0]!.description).toContain('a human must approve');
    expect(call).toHaveBeenCalledWith('cart.addItem', { sku: 'a' });
    expect(result.text).toBe('done');
    expect(result.messages.at(-2)?.role).toBe('tool');
  });

  it('routes api.* tools through /_janux/api instead of the bridge', async () => {
    const call = installBridge();
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async (url: string) => Response.json({ matches: [] }));

    globalThis.fetch = fetchMock as any;
    const { llm } = scriptedLlm([{ id: '1', name: 'api_docs_searchDocs', arguments: { query: 'x' } }]);

    await createCopilot({ llm }).ask('search x');
    globalThis.fetch = originalFetch;

    expect(call).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/_janux/api/docs.searchDocs');
  });

  it('skips manifest bridging when manifestTools is false, but keeps navigate', async () => {
    installBridge();
    const { llm, seen } = scriptedLlm([]);

    await createCopilot({ llm, manifestTools: false }).ask('hi');

    expect(seen[0]!.tools.map((tool) => tool.name)).toEqual(['navigate']);
  });

  it('navigate drives the page through the framework tool', async () => {
    installBridge();
    document.body.innerHTML = '<a href="/docs/guide/cli-and-deployment">CLI</a>';
    const assign = mock((path: string) => path);

    (location as any).assign = assign;
    const { llm } = scriptedLlm([{ id: '1', name: 'navigate', arguments: { path: '/docs/guide/cli-and-deployment' } }]);

    await createCopilot({ llm, manifestTools: false }).ask('go to cli');
    await new Promise((resolve) => setTimeout(resolve, 420));

    expect(assign).toHaveBeenCalledWith('/docs/guide/cli-and-deployment');
  });

  it('never overwrites a same-named tool the app registered itself', async () => {
    installBridge();
    const appExecute = mock(async () => 'app wins');

    registry.register({ name: 'cart_addItem', description: 'App-owned', execute: appExecute });
    const { llm } = scriptedLlm([{ id: '1', name: 'cart_addItem', arguments: {} }]);

    await createCopilot({ llm }).ask('add');

    expect(appExecute).toHaveBeenCalled();
  });

  /**
   * The agent's activity deserves the same visualization in every Janux app, so
   * it is a copilot option rather than wiring each app repeats: chips, the
   * animated ring and the veil, fed by the runtime's two feedback events.
   */
  it('visualize mounts an overlay that survives navigations and chains onStep', async () => {
    installBridge();
    const steps: string[] = [];
    const { llm } = scriptedLlm([]);
    const copilot = createCopilot({ llm, visualize: true, onStep: (step) => steps.push(step.type) });
    const host = document.querySelector('[data-janux-agent-steps]')!;

    expect(host.parentElement).toBe(document.body);
    expect(host.hasAttribute('data-janux-keep')).toBe(true);
    expect(copilot.visualizer).toBeDefined();
    await copilot.ask('hi');

    // The app's own onStep still runs — the visualizer chains onto it.
    expect(steps).toContain('llm-request');
    copilot.dispose();
    expect(document.querySelector('[data-janux-agent-steps]')).toBeNull();
  });

  it('visualize takes over the built-in glow instead of painting on top of it', async () => {
    const { enableAgentGlow } = await import('janux/client');

    installBridge();
    document.body.innerHTML = '<button id="go">Go</button>';
    const { llm } = scriptedLlm([]);
    const disableGlow = enableAgentGlow({ duration: 10 });
    const button = document.getElementById('go')!;
    const flash = () =>
      document.dispatchEvent(
        new CustomEvent('janux:tool-target', { detail: { element: button, action: 'click', selector: '#go' } }),
      );
    const copilot = createCopilot({ llm, visualize: true });

    flash();
    expect(button.classList.contains('janux-agent-glow')).toBe(false);
    // The ring host gui-agent creates on first use must outlive a navigation too.
    expect(document.querySelector('[data-gui-agent-highlight]')?.hasAttribute('data-janux-keep')).toBe(true);

    copilot.dispose();
    flash();
    expect(button.classList.contains('janux-agent-glow')).toBe(true);
    disableGlow();
    button.classList.remove('janux-agent-glow');
  });

  it('dispose unregisters the bridged tools', async () => {
    installBridge();
    const { llm } = scriptedLlm([]);
    const copilot = createCopilot({ llm });

    await copilot.ask('hi');
    expect(registry.has('cart_addItem')).toBe(true);
    copilot.dispose();
    expect(registry.has('cart_addItem')).toBe(false);
  });
});
