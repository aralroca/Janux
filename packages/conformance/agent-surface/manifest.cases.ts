import { buildManifest, component, createInstance, intent, int, jsx, schema, str, store } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The manifest: what an agent is told exists.
 *
 * "The mounted component tree IS the MCP tree" means a mistake here is not a
 * cosmetic one — a `forbidden` intent that leaks into the list is an advertised
 * capability, and a manifest that fails to build leaves the agent with nothing at
 * all.
 */

const cart = (extra: Record<string, unknown> = {}) =>
  component({
    name: 'cart',
    description: 'Shopping cart',
    state: schema({ items: int(), coupon: str().optional() }),
    intents: {
      add: intent({ description: 'Add an item', input: schema({ sku: str() }), run: () => {} }),
      pay: intent({ description: 'Pay', guard: 'confirm', run: () => {} }),
      nuke: intent({ description: 'Never for agents', guard: 'forbidden', run: () => {} }),
    },
    view: () => jsx('div', {}),
    ...extra,
  });

const session = store({ name: 'session', state: schema({ user: str() }), intents: {} });

/** `name:guard` per advertised tool, in order. */
const tools = (manifest: { tools: { name: string; guard: string }[] }) =>
  manifest.tools.map((tool) => `${tool.name}:${tool.guard}`).join(' ');

export const MANIFEST_CASES: ScenarioCase[] = [
  {
    id: 'manifest-advertises-auto-and-confirm-tools',
    src: 'janux',
    run: (log) => log.push(tools(buildManifest([{ def: cart() as never }]))),
    expected: ['cart.add:auto cart.pay:confirm'],
  },
  {
    id: 'manifest-resolves-origin-aware-guards-as-the-agent-sees-them',
    src: 'janux',
    run: (log) => {
      const gated = component({
        name: 'gated',
        description: 'Origin-aware guards',
        intents: {
          save: intent({
            description: 'Auto for humans, approval for agents',
            guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'),
            run: () => {},
          }),
        },
        view: () => jsx('div', {}),
      });

      log.push(tools(buildManifest([{ def: gated as never }])));
    },
    expected: ['gated.save:confirm'],
  },
  {
    id: 'manifest-omits-a-forbidden-intent-entirely',
    src: 'janux',
    run: (log) => {
      const names = buildManifest([{ def: cart() as never }]).tools.map((tool) => tool.name);

      log.push(`nuke-present=${names.includes('cart.nuke')}`);
    },
    expected: ['nuke-present=false'],
  },
  {
    id: 'manifest-describes-a-resource-for-a-stateful-component',
    src: 'janux',
    run: (log) => {
      const [resource] = buildManifest([{ def: cart() as never }]).resources;

      log.push(`${resource!.uri} ${resource!.description}`);
    },
    expected: ['ui://cart Shopping cart'],
  },
  {
    id: 'manifest-resource-carries-the-state-json-schema',
    src: 'janux',
    run: (log) => {
      const [resource] = buildManifest([{ def: cart() as never }]).resources;

      log.push(JSON.stringify(resource!.schema));
    },
    expected: [
      '{"type":"object","properties":{"items":{"type":"integer"},"coupon":{"type":"string"}},"required":["items"],"additionalProperties":false}',
    ],
  },
  {
    id: 'manifest-tool-input-is-projected-as-json-schema',
    src: 'janux',
    run: (log) => log.push(JSON.stringify(buildManifest([{ def: cart() as never }]).tools[0]!.input)),
    expected: ['{"type":"object","properties":{"sku":{"type":"string"}},"required":["sku"],"additionalProperties":false}'],
  },
  {
    id: 'manifest-a-tool-without-an-input-schema-advertises-none',
    src: 'janux',
    run: (log) => {
      const pay = buildManifest([{ def: cart() as never }]).tools.find((tool) => tool.name === 'cart.pay');

      log.push(`input=${String(pay!.input)}`);
    },
    expected: ['input=undefined'],
  },
  {
    id: 'manifest-keyed-island-gets-a-fragment-in-its-uri',
    src: 'janux',
    run: (log) => log.push(buildManifest([{ def: cart() as never, key: 'main' }]).resources[0]!.uri),
    expected: ['ui://cart#main'],
  },
  {
    id: 'manifest-the-default-key-is-left-out-of-the-uri',
    src: 'janux',
    run: (log) => log.push(buildManifest([{ def: cart() as never, key: 'default' }]).resources[0]!.uri),
    expected: ['ui://cart'],
  },
  {
    id: 'manifest-a-store-uses-the-store-scheme',
    src: 'janux',
    run: (log) => log.push(buildManifest([{ def: session as never }]).resources[0]!.uri),
    expected: ['store://session'],
  },
  {
    id: 'manifest-a-store-lists-the-components-that-read-it',
    src: 'janux',
    run: (log) => {
      const withStore = cart({ use: { session } });
      const manifest = buildManifest([{ def: withStore as never }, { def: session as never }]);
      const resource = manifest.resources.find((entry) => entry.uri === 'store://session');

      log.push((resource!.readers ?? []).join(','));
    },
    expected: ['ui://cart'],
  },
  {
    id: 'manifest-a-stateless-component-has-no-resource',
    src: 'janux',
    run: (log) => {
      const stateless = component({ name: 'plain', intents: {}, view: () => jsx('div', {}) });

      log.push(`resources=${buildManifest([{ def: stateless as never }]).resources.length}`);
    },
    expected: ['resources=0'],
  },
  {
    id: 'manifest-collects-declared-events-once',
    src: 'janux',
    run: (log) => {
      const emitter = cart({ emits: { paid: schema({ id: str() }), failed: schema({ why: str() }) } });

      log.push(buildManifest([{ def: emitter as never }, { def: emitter as never }]).events.join(','));
    },
    expected: ['paid,failed'],
  },
  {
    id: 'manifest-reports-ready-true-without-an-instance',
    src: 'janux',
    run: (log) => {
      const gated = cart({
        intents: {
          go: intent({ description: 'x', ready: () => false, run: () => {} }),
        },
      });

      log.push(`ready=${buildManifest([{ def: gated as never }]).tools[0]!.ready}`);
    },
    expected: ['ready=true'],
  },
  {
    id: 'manifest-consults-ready-when-an-instance-is-mounted',
    src: 'janux',
    run: (log) => {
      const gated = component({
        name: 'gated',
        state: schema({ n: int() }),
        intents: { go: intent({ description: 'x', ready: ({ state }) => (state as { n: number }).n > 0, run: () => {} }) },
        view: () => jsx('div', {}),
      });
      const instance = createInstance(gated, {} as never);

      log.push(`closed=${buildManifest([{ def: gated as never, instance }]).tools[0]!.ready}`);
    },
    expected: ['closed=false'],
  },
  {
    id: 'manifest-a-throwing-ready-check-reports-not-ready',
    src: 'janux',
    run: (log) => {
      const gated = component({
        name: 'gated',
        state: schema({ n: int() }),
        intents: {
          go: intent({
            description: 'x',
            ready: () => {
              throw new Error('ready blew up');
            },
            run: () => {},
          }),
        },
        view: () => jsx('div', {}),
      });
      const instance = createInstance(gated, {} as never);

      log.push(`ready=${buildManifest([{ def: gated as never, instance }]).tools[0]!.ready}`);
    },
    expected: ['ready=false'],
  },

  // ── a bad guard must not blank the agent surface ─────────────────────────────
  {
    id: 'manifest-a-throwing-guard-omits-only-that-tool',
    src: 'janux',
    run: (log) => {
      const risky = cart({
        intents: {
          fine: intent({ description: 'ok', run: () => {} }),
          bad: intent({
            description: 'guard throws',
            guard: (() => {
              throw new Error('guard blew up');
            }) as never,
            run: () => {},
          }),
        },
      });

      attempt(log, 'build', () => log.push(tools(buildManifest([{ def: risky as never }]))));
    },
    expected: ['cart.fine:auto', 'build:ok'],
  },
  {
    id: 'manifest-a-guard-answering-differently-each-call-stays-consistent',
    src: 'janux',
    run: (log) => {
      let calls = 0;
      const flaky = cart({
        intents: {
          t: intent({ description: 'x', guard: (() => (calls++ % 2 ? 'forbidden' : 'auto')) as never, run: () => {} }),
        },
      });
      const manifest = buildManifest([{ def: flaky as never }]);
      const listed = manifest.tools.map((tool) => `${tool.name}:${tool.guard}`);

      // Either omitted, or listed with a guard that is not `forbidden` — never
      // advertised *as* forbidden, which is what two resolutions produced.
      log.push(listed.filter((entry) => entry.endsWith(':forbidden')).join(',') || 'none-advertised-as-forbidden');
    },
    expected: ['none-advertised-as-forbidden'],
  },
  {
    id: 'manifest-a-guard-sees-the-context',
    src: 'janux',
    run: (log) => {
      const scoped = cart({
        intents: {
          t: intent({
            description: 'x',
            guard: (({ ctx }: { ctx: { role?: string } }) => (ctx.role === 'admin' ? 'auto' : 'forbidden')) as never,
            run: () => {},
          }),
        },
      });

      log.push(
        `admin=${tools(buildManifest([{ def: scoped as never }], { role: 'admin' } as never))}`,
        `guest=${tools(buildManifest([{ def: scoped as never }], { role: 'guest' } as never)) || 'nothing'}`,
      );
    },
    expected: ['admin=cart.t:auto', 'guest=nothing'],
  },
  {
    id: 'manifest-version-is-stated',
    src: 'janux',
    run: (log) => log.push(buildManifest([]).janux),
    expected: ['0.1'],
  },
  {
    id: 'manifest-of-nothing-is-empty-but-well-formed',
    src: 'janux',
    run: (log) => {
      const manifest = buildManifest([]);

      log.push(`${manifest.resources.length} ${manifest.tools.length} ${manifest.events.length}`);
    },
    expected: ['0 0 0'],
  },
];
