import { component, intent, int, jsx, schema } from 'janux';
import { createBridge } from '../../janux/src/client/bridge';
import { createBus } from '../../janux/src/runtime/bus';
import { createClientRegistry, registerDef } from '../../janux/src/client/registry';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `window.janux.call` — the door an agent knocks on.
 *
 * The tool name arrives over the wire, so it is untrusted regardless of what the
 * component definitions look like. `tool.split('.')` destructured the first two
 * parts and carried on, so every suffix was ignored and `cart.pay.anything.at.all`
 * ran `cart.pay`: names absent from the manifest were executable, which is exactly
 * the drift between UI and agent surface Janux claims cannot happen.
 */

const MALFORMED = 'Janux: malformed tool name';

function mounted() {
  const cart = component({
    name: 'cart',
    state: schema({ n: int() }),
    intents: {
      pay: intent({ description: 'Pay', run: () => 'PAY-RAN' }),
      look: intent({ description: 'Look', guard: 'forbidden', run: () => 'LOOK-RAN' }),
    },
    view: () => jsx('div', {}),
  });
  const registry = createClientRegistry();

  registerDef(registry, cart as never);
  document.body.innerHTML = '<janux-island data-jx="cart#default"></janux-island>';

  return createBridge(
    { registry, bus: createBus(), ctx: {}, inflight: new Set(), onProposal: () => {} } as never,
    new Map(),
  );
}

export const BRIDGE_CALL_CASES: ScenarioCase[] = [
  {
    id: 'bridge-a-well-formed-tool-name-runs',
    src: 'janux',
    run: async (log) => {
      log.push(String(await mounted().call('cart.pay', {})));
    },
    expected: ['PAY-RAN'],
  },
  {
    id: 'bridge-a-trailing-segment-is-refused-not-ignored',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart.pay.now', {}));
    },
    expected: [`call:threw:${MALFORMED} "cart.pay.now" — expected "component.intent"`],
  },
  {
    id: 'bridge-many-trailing-segments-are-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart.pay.anything.at.all', {}));
    },
    expected: [`call:threw:${MALFORMED} "cart.pay.anything.at.all" — expected "component.intent"`],
  },
  {
    id: 'bridge-a-bare-component-name-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart', {}));
    },
    expected: [`call:threw:${MALFORMED} "cart" — expected "component.intent"`],
  },
  {
    id: 'bridge-an-empty-tool-name-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('', {}));
    },
    expected: [`call:threw:${MALFORMED} "" — expected "component.intent"`],
  },
  {
    id: 'bridge-a-leading-dot-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('.pay', {}));
    },
    expected: [`call:threw:${MALFORMED} ".pay" — expected "component.intent"`],
  },
  {
    id: 'bridge-a-trailing-dot-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart.', {}));
    },
    expected: [`call:threw:${MALFORMED} "cart." — expected "component.intent"`],
  },
  {
    id: 'bridge-a-doubled-separator-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart..pay', {}));
    },
    expected: [`call:threw:${MALFORMED} "cart..pay" — expected "component.intent"`],
  },
  {
    id: 'bridge-an-unknown-intent-on-a-real-component-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart.nope', {}));
    },
    expected: ['call:threw:Janux: unknown tool "cart.nope"'],
  },
  {
    id: 'bridge-an-unknown-component-is-refused',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('ghost.pay', {}));
    },
    expected: ['call:threw:Janux: no mounted surface for "ghost"'],
  },
  {
    id: 'bridge-a-forbidden-intent-is-refused-through-the-bridge',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => mounted().call('cart.look', {}));
    },
    expected: ['call:threw:Intent "cart.look" is not available'],
  },
  {
    // Pinned, not fixed: a tool is named `component.intent` with no key, so two
    // mounted instances of the same component share one addressable name and the
    // agent always reaches the first in document order. Giving the agent a way to
    // target the second means putting the island key in the tool name — a wire
    // format change, not a hardening fix. See GAPS.md.
    id: 'bridge-two-instances-of-a-component-resolve-to-the-first-in-document-order',
    src: 'janux',
    run: async (log) => {
      const bridge = mounted();

      document.body.innerHTML =
        '<janux-island data-jx="cart#first"></janux-island><janux-island data-jx="cart#second"></janux-island>';
      log.push(String(await bridge.call('cart.pay', {})));
      log.push(`reached=${document.querySelector('janux-island')!.getAttribute('data-jx')}`);
    },
    expected: ['PAY-RAN', 'reached=cart#first'],
  },
  {
    id: 'bridge-an-unresolvable-tool-reports-an-unknown-guard-not-auto',
    src: 'janux',
    run: async (log) => {
      const guards: string[] = [];

      document.addEventListener('janux:tool-call', (event) => {
        guards.push(String((event as CustomEvent).detail.guard));
      });
      await attempt(log, 'call', () => mounted().call('cart.nope', {}));
      log.push(`guard=${guards[0]}`);
    },
    expected: ['call:threw:Janux: unknown tool "cart.nope"', 'guard=unknown'],
  },
];
