import { beforeEach, describe, expect } from 'bun:test';
import { component, intent, jsx } from 'janux';
import { createBridge } from '../../janux/src/client/bridge';
import { createBus } from '../../janux/src/runtime/bus';
import { createClientRegistry, registerDef } from '../../janux/src/client/registry';
import { resetDocument, useDom } from '../support/dom';
import { runCases } from '../support/scenario';
import { TOOL_SCOPE_CASES, type ToolScopeRow } from './tool-scopes.cases';

/**
 * The third door: `window.janux`, the in-page bridge an embedded agent drives.
 *
 * It reads the same `ctx` the page booted with (`boot({ ctx })`), so the grant
 * has to travel there like any other request fact — and both halves are
 * asserted, because a bridge that hides the intent but still runs it on
 * request is exactly the "invisible is not protected" failure.
 */

useDom();

const cart = component({
  name: 'cart',
  intents: {
    view: intent({ description: 'View the cart', scopes: ['orders:read'], run: () => 'VIEWED' }),
    empty: intent({ description: 'Empty the cart', scopes: ['orders:write'], run: () => 'EMPTIED' }),
  },
  view: () => jsx('div', {}),
});

function bridgeFor(row: ToolScopeRow) {
  const registry = createClientRegistry();

  registerDef(registry, cart as never);
  document.body.innerHTML = '<janux-island data-jx="cart#default"></janux-island>';

  return createBridge(
    {
      registry,
      bus: createBus(),
      ctx: { scopes: row.session, agent: row.agent && { verified: true, scopes: row.agent } },
      inflight: new Set(),
      onProposal: () => {},
    } as never,
    new Map(),
  );
}

/** What the caller experiences: the value, or the refusal, never a swallowed error. */
async function call(bridge: ReturnType<typeof bridgeFor>, name: string, log: string[]): Promise<void> {
  try {
    log.push(`${name}:${await bridge.call(`cart.${name}`, {})}`);
  } catch (error) {
    log.push(`${name}:threw:${(error as Error).message}`);
  }
}

async function runRow(row: ToolScopeRow): Promise<string[]> {
  const bridge = bridgeFor(row);
  const log: string[] = [];

  // First, because `manifest()` describes what is mounted and the island
  // mounts on its first call — the same order a real agent turn takes.
  await call(bridge, 'view', log);
  log.push(`tools:${bridge.manifest().tools.map((tool) => tool.name).sort().join(',')}`);
  await call(bridge, 'empty', log);

  return log;
}

describe('per-agent scopes: the in-page bridge', () => {
  beforeEach(resetDocument);
  runCases(
    TOOL_SCOPE_CASES.filter((row) => row.via === 'bridge'),
    async (row) => expect(await runRow(row)).toEqual(row.expected),
  );
});
