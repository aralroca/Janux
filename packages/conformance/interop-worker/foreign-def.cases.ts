import { component, jsx, schema, str } from 'janux';
import { foreign, isForeignDef } from 'janux/interop';
import { createClientRegistry, registerDef, resolveDef } from '../../janux/src/client/registry';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * What `foreign()` promises about the DEFINITION itself, before anything is
 * rendered.
 *
 * A foreign island is declared once at module scope and then referenced from
 * views, serialized into markup ids and looked up on the client by name — so the
 * name it picks, the shape it freezes and the defaults it fills in are load-
 * bearing long before React is involved. Nothing here needs a DOM.
 */

function Gauge() {
  return null;
}

class Legacy {
  render() {
    return null;
  }
}

export const FOREIGN_DEF_CASES: ScenarioCase[] = [
  // ── naming: what ends up in `data-jx` and in the client registry ────────────
  {
    id: 'foreign-name-defaults-to-the-function-name',
    src: 'janux',
    run: (log) => log.push(foreign(Gauge).name),
    expected: ['Gauge'],
  },
  {
    id: 'foreign-name-prefers-display-name-over-the-function-name',
    src: 'janux',
    run: (log) => {
      const Named = Object.assign(() => null, { displayName: 'Chart' });

      log.push(foreign(Named).name);
    },
    expected: ['Chart'],
  },
  {
    id: 'foreign-an-explicit-name-wins-over-both',
    src: 'janux',
    run: (log) => {
      const Named = Object.assign(() => null, { displayName: 'Chart' });

      log.push(foreign(Named, { name: 'gauge' }).name);
    },
    expected: ['gauge'],
  },
  {
    id: 'foreign-a-class-component-is-named-by-its-class',
    src: 'janux',
    run: (log) => log.push(foreign(Legacy).name),
    expected: ['Legacy'],
  },
  {
    id: 'foreign-an-anonymous-component-falls-back-to-foreign',
    src: 'janux',
    run: (log) => {
      // A `memo()`/`forwardRef()` result, or anything built by a factory: the
      // empty string a nameless function reports is not a usable island name.
      const anonymous = (() => () => null)();

      log.push(foreign(anonymous).name);
    },
    expected: ['foreign'],
  },
  {
    id: 'foreign-a-memo-like-object-with-no-name-falls-back-to-foreign',
    src: 'janux',
    run: (log) => log.push(foreign({ $$typeof: Symbol.for('react.memo'), type: Gauge }).name),
    expected: ['foreign'],
  },
  {
    id: 'foreign-a-memo-like-object-uses-its-display-name',
    src: 'janux',
    run: (log) => log.push(foreign({ $$typeof: Symbol.for('react.memo'), displayName: 'Memoed' }).name),
    expected: ['Memoed'],
  },
  {
    id: 'foreign-an-empty-explicit-name-falls-back-instead-of-emitting-a-nameless-host',
    src: 'janux',
    run: (log) => log.push(foreign(Gauge, { name: '' }).name),
    // An empty name reaches the markup as `data-jx="#default"`: a host the
    // client registry cannot match, so the island never mounts and nothing
    // says why. Empty is treated as unset, wherever it came from.
    expected: ['Gauge'],
  },
  {
    id: 'foreign-defining-the-same-component-twice-yields-two-independent-defs',
    src: 'janux',
    run: (log) => {
      const left = foreign(Gauge, { name: 'left' });
      const right = foreign(Gauge, { name: 'right' });

      log.push(`same=${(left as object) === (right as object)}`, `names=${left.name},${right.name}`);
    },
    expected: ['same=false', 'names=left,right'],
  },
  {
    id: 'foreign-keeps-the-component-reference-untouched',
    src: 'janux',
    run: (log) => log.push(String(foreign(Gauge).component === Gauge)),
    // Wrapping it would break every library that checks component identity
    // (memo, devtools, error boundaries keyed by type).
    expected: ['true'],
  },

  // ── defaults and options ────────────────────────────────────────────────────
  {
    id: 'foreign-hydrates-on-load-by-default',
    src: 'janux',
    run: (log) => log.push(foreign(Gauge).options.hydrate),
    expected: ['load'],
  },
  {
    id: 'foreign-keeps-an-explicit-hydrate-directive',
    src: 'janux',
    run: (log) => log.push(foreign(Gauge, { hydrate: 'idle' }).options.hydrate, foreign(Gauge, { hydrate: 'visible' }).options.hydrate, foreign(Gauge, { hydrate: 'only' }).options.hydrate),
    expected: ['idle', 'visible', 'only'],
  },
  {
    id: 'foreign-stores-the-props-mapper-verbatim',
    src: 'janux',
    run: (log) => {
      const map = (own: Record<string, unknown>) => own;

      log.push(String(foreign(Gauge, { props: map }).options.props === map));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-stores-the-event-map-verbatim',
    src: 'janux',
    run: (log) => {
      const on = { onPick: 'pick' };

      log.push(String(foreign(Gauge, { on }).options.on === on));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-leaves-props-and-on-undefined-when-unset',
    src: 'janux',
    run: (log) => {
      const def = foreign(Gauge);

      log.push(`props=${def.options.props}`, `on=${def.options.on}`);
    },
    expected: ['props=undefined', 'on=undefined'],
  },
  {
    id: 'foreign-marks-itself-with-a-kind-tag',
    src: 'janux',
    run: (log) => log.push(foreign(Gauge).kind),
    expected: ['foreign'],
  },
  {
    id: 'foreign-freezes-the-def-so-a-shared-module-level-island-cannot-drift',
    src: 'janux',
    run: (log) => {
      const def = foreign(Gauge, { name: 'gauge' });

      attempt(log, 'rename', () => ((def as { name: string }).name = 'other'));
      log.push(`name=${def.name}`);
    },
    // Every view referencing the island shares this one object; a rename after
    // definition would desynchronise markup ids from the client registry.
    expected: ["rename:threw:Attempted to assign to readonly property.", 'name=gauge'],
  },
  {
    id: 'foreign-does-not-freeze-the-nested-options-object',
    src: 'janux',
    run: (log) => {
      const def = foreign(Gauge);

      attempt(log, 'mutate', () => (def.options.hydrate = 'idle'));
      log.push(`hydrate=${def.options.hydrate}`);
    },
    // Honest record of a shallow freeze: nothing depends on it, but a test that
    // claimed deep immutability would be a lie the next refactor inherits.
    expected: ['mutate:ok', 'hydrate=idle'],
  },
  {
    id: 'foreign-does-not-mutate-the-options-object-it-was-given',
    src: 'janux',
    run: (log) => {
      const options = {};

      foreign(Gauge, options);
      log.push(JSON.stringify(options));
    },
    expected: ['{}'],
  },
  {
    id: 'foreign-accepts-a-component-that-does-not-exist-yet',
    src: 'janux',
    run: (log) => {
      // A circular import resolves to `undefined` at module-evaluation time; the
      // definition must not be what explodes, or the real error never surfaces.
      const def = foreign(undefined);

      log.push(def.name, String(def.component));
    },
    expected: ['foreign', 'undefined'],
  },

  // ── recognising a foreign def among everything else a view can hold ─────────
  {
    id: 'foreign-is-recognised-by-is-foreign-def',
    src: 'janux',
    run: (log) => log.push(String(isForeignDef(foreign(Gauge)))),
    expected: ['true'],
  },
  {
    id: 'foreign-a-janux-component-is-not-a-foreign-def',
    src: 'janux',
    run: (log) => {
      const shell = component({ name: 'shell', state: schema({ a: str().default('') }), intents: {}, view: () => null });

      log.push(String(isForeignDef(shell)));
    },
    expected: ['false'],
  },
  {
    id: 'foreign-a-tag-string-is-not-a-foreign-def',
    src: 'janux',
    run: (log) => log.push(String(isForeignDef('div')), String(isForeignDef(null)), String(isForeignDef(undefined)), String(isForeignDef(Gauge))),
    expected: ['false', 'false', 'false', 'false'],
  },
  {
    id: 'foreign-the-check-is-structural-not-nominal',
    src: 'janux',
    run: (log) => log.push(String(isForeignDef({ kind: 'foreign' }))),
    // The client receives defs across a module boundary (and, in tests, across
    // duplicated copies of the package): an `instanceof` check would fail there.
    expected: ['true'],
  },

  // ── how a def enters a view ─────────────────────────────────────────────────
  {
    id: 'foreign-a-def-used-as-a-jsx-tag-becomes-the-node-type',
    src: 'janux',
    run: (log) => {
      const def = foreign(Gauge, { name: 'gauge' });
      const node = jsx(def as never, { level: 2 }) as { $t: unknown; $p: Record<string, unknown> };

      log.push(String(node.$t === (def as unknown)), JSON.stringify(node.$p));
    },
    expected: ['true', '{"level":2}'],
  },
  {
    id: 'foreign-a-def-is-not-callable-at-runtime',
    src: 'janux',
    run: (log) => {
      // The TSX-callable signature is a phantom for the type checker only —
      // calling it directly (a copy-paste from a React codebase) must say so
      // rather than half-work.
      const def = foreign(Gauge, { name: 'gauge' }) as unknown as () => unknown;

      attempt(log, 'call', () => def());
    },
    expected: ["call:threw:def is not a function. (In 'def()', 'def' is an instance of Object)"],
  },
  {
    id: 'foreign-a-def-spread-into-another-object-is-just-data',
    src: 'janux',
    run: (log) => {
      // Islands are serialized, copied and merged in build tooling: a def that
      // only worked as the original reference would break the first time.
      const copy = { ...foreign(Gauge, { name: 'gauge' }) };

      log.push(String(isForeignDef(copy)), copy.name, String(copy.component === Gauge));
    },
    expected: ['true', 'gauge', 'true'],
  },
  {
    id: 'foreign-stores-a-mapped-event-binding-as-written',
    src: 'janux',
    run: (log) => {
      const input = ({ args }: { args: unknown[] }) => ({ index: args[1] });
      const def = foreign(Gauge, { name: 'gauge', on: { onCell: { intent: 'pickCell', input } } });
      const binding = def.options.on!.onCell as { intent: string; input: unknown };

      log.push(binding.intent, String(binding.input === input));
    },
    expected: ['pickCell', 'true'],
  },

  // ── how the client registry files a foreign def ─────────────────────────────
  {
    id: 'foreign-registers-into-the-foreign-table-not-the-island-table',
    src: 'janux',
    run: (log) => {
      const registry = createClientRegistry();

      registerDef(registry, foreign(Gauge, { name: 'gauge' }) as never);
      log.push(`foreigns=${registry.foreignDefs.size}`, `islands=${registry.defs.size}`);
    },
    expected: ['foreigns=1', 'islands=0'],
  },
  {
    id: 'foreign-and-an-island-of-the-same-name-are-filed-separately',
    src: 'janux',
    run: (log) => {
      // Both end up in the markup as `name#key`, on different tags: the client
      // must not resolve one for the other.
      const registry = createClientRegistry();
      const island = component({ name: 'gauge', state: schema({ a: str().default('') }), intents: {}, view: () => null });

      registerDef(registry, foreign(Gauge, { name: 'gauge' }) as never);
      registerDef(registry, island);
      log.push(`foreign=${registry.foreignDefs.get('gauge')!.kind}`, `island=${registry.defs.get('gauge')!.name}`);
    },
    expected: ['foreign=foreign', 'island=gauge'],
  },
  {
    id: 'foreign-registering-the-same-name-twice-keeps-the-last-def',
    src: 'janux',
    run: (log) => {
      const registry = createClientRegistry();

      registerDef(registry, foreign(Gauge, { name: 'gauge', hydrate: 'load' }) as never);
      registerDef(registry, foreign(Gauge, { name: 'gauge', hydrate: 'idle' }) as never);
      log.push(`count=${registry.foreignDefs.size}`, registry.foreignDefs.get('gauge')!.options.hydrate);
    },
    expected: ['count=1', 'idle'],
  },
  {
    id: 'foreign-a-foreign-name-is-not-resolvable-as-an-island',
    src: 'janux',
    run: async (log) => {
      const registry = createClientRegistry();

      registerDef(registry, foreign(Gauge, { name: 'gauge' }) as never);
      await attempt(log, 'resolve', () => resolveDef(registry, 'gauge'));
    },
    expected: ['resolve:threw:Janux: unknown island "gauge" (no loader registered)'],
  },
];
