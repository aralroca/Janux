import { component, intent, int, jsx, schema, store } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The tool namespace, attacked.
 *
 * An agent addresses a tool as `component.intent`. Component names are validated
 * kebab-case, but intent names were not validated at all — and they are object
 * keys, so a `.` inside one is legal JavaScript. That makes the namespace
 * ambiguous, and `bridge.call` resolved a name by destructuring only the first two
 * parts of `tool.split('.')`, so a three-part name silently ran a *different*
 * intent than the one asked for.
 *
 * The exploit that motivated these rows: give `cart` an `auto` intent `pay` and a
 * `forbidden` intent `pay.now`. The manifest correctly omits the forbidden one.
 * An agent calling `cart.pay.now` was then resolved to `cart.pay` and the auto
 * intent *ran* — asking for a refused tool produced side effects from another one,
 * with the guard of a third thing reported on the event.
 */

const withIntentNames = (names: string[]) =>
  component({
    name: 'cart',
    state: schema({ n: int() }),
    intents: Object.fromEntries(names.map((name) => [name, intent({ description: name, run: () => name })])),
    view: () => jsx('div', {}),
  });

export const TOOL_NAMESPACE_CASES: ScenarioCase[] = [
  // ── the separator may not appear inside a name ───────────────────────────────
  {
    id: 'ns-an-intent-name-may-not-contain-the-separator',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay.now'])),
    expected: [
      'define:threw:Janux: intent name "pay.now" in component "cart" may not contain "." — it separates the component from the intent in a tool name',
    ],
  },
  {
    id: 'ns-a-leading-dot-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['.pay'])),
    expected: [
      'define:threw:Janux: intent name ".pay" in component "cart" may not contain "." — it separates the component from the intent in a tool name',
    ],
  },
  {
    id: 'ns-a-trailing-dot-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay.'])),
    expected: [
      'define:threw:Janux: intent name "pay." in component "cart" may not contain "." — it separates the component from the intent in a tool name',
    ],
  },
  {
    id: 'ns-the-offending-name-is-reported-even-among-valid-ones',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay', 'refund.all', 'cancel'])),
    expected: [
      'define:threw:Janux: intent name "refund.all" in component "cart" may not contain "." — it separates the component from the intent in a tool name',
    ],
  },
  {
    id: 'ns-a-store-validates-its-intent-names-too',
    src: 'janux',
    run: (log) =>
      attempt(log, 'define', () =>
        store({
          name: 'session',
          state: schema({ n: int() }),
          intents: { 'set.locale': intent({ description: 'x', run: () => {} }) },
        }),
      ),
    expected: [
      'define:threw:Janux: intent name "set.locale" in component "session" may not contain "." — it separates the component from the intent in a tool name',
    ],
  },

  // ── the names apps actually use keep working ─────────────────────────────────
  {
    id: 'ns-camelcase-intent-names-are-accepted',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['addItem', 'changeQty', 'applyCoupon'])),
    expected: ['define:ok'],
  },
  {
    id: 'ns-snake-case-intent-names-are-accepted',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['add_item'])),
    expected: ['define:ok'],
  },
  {
    id: 'ns-a-single-word-intent-name-is-accepted',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay'])),
    expected: ['define:ok'],
  },
  {
    id: 'ns-a-numeric-suffix-is-accepted',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['step2'])),
    expected: ['define:ok'],
  },
  {
    id: 'ns-a-component-with-no-intents-is-fine',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames([])),
    expected: ['define:ok'],
  },

  // ── other characters that would break the wire name ─────────────────────────
  {
    id: 'ns-a-space-in-an-intent-name-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay now'])),
    expected: [
      'define:threw:Janux: intent name "pay now" in component "cart" must be a plain identifier — it becomes part of an agent tool name',
    ],
  },
  {
    id: 'ns-a-colon-in-an-intent-name-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay:now'])),
    expected: [
      'define:threw:Janux: intent name "pay:now" in component "cart" must be a plain identifier — it becomes part of an agent tool name',
    ],
  },
  {
    id: 'ns-a-slash-in-an-intent-name-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay/now'])),
    expected: [
      'define:threw:Janux: intent name "pay/now" in component "cart" must be a plain identifier — it becomes part of an agent tool name',
    ],
  },
  {
    id: 'ns-an-empty-intent-name-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames([''])),
    expected: [
      'define:threw:Janux: intent name "" in component "cart" must be a plain identifier — it becomes part of an agent tool name',
    ],
  },
  {
    id: 'ns-a-double-underscore-is-refused-like-api-names',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => withIntentNames(['pay__now'])),
    expected: [
      'define:threw:Janux: intent name "pay__now" in component "cart" must be a plain identifier — it becomes part of an agent tool name',
    ],
  },
];
