import { createInstance, component, intent, list, obj, schema, str } from 'janux';
import { detachProps } from '../../janux/src/interop/detach';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The props boundary: what actually crosses from island state into a foreign
 * runtime.
 *
 * Two failures live here, and both were met in the wild. A library that
 * deep-freezes its props (Immer, and therefore Redux Toolkit, and therefore
 * Recharts 3) freezes the TARGET of whatever proxy it is handed, which would
 * leave island state permanently unwritable. And a boundary that clones too
 * eagerly destroys everything that is not state-shaped — a `Date` becomes `{}`,
 * a React element becomes a look-alike React never memoized — which is the
 * quieter of the two and the more expensive to debug.
 *
 * So: plain containers are copied, at every depth; everything else crosses by
 * identity, at every depth.
 */

const rowsShell = component({
  name: 'rows-shell',
  description: 'Rows',
  state: schema({ rows: list(obj({ id: str() })).default([{ id: 'a' }]), label: str().default('one') }),
  intents: {
    addRow: intent({ description: 'Add', run: ({ state }) => state.rows.push({ id: 'b' } as never) }),
    relabel: intent({ description: 'Relabel', run: ({ state }) => (state.label = 'two') }),
  },
  view: () => null,
});

const withRows = () => createInstance(rowsShell, {} as never);

/** A React element as React itself stamps one: a plain object with a symbol marker. */
function elementLike(text: string): Record<string, unknown> {
  return { $$typeof: Symbol.for('react.element'), type: 'span', key: null, props: { children: text } };
}

class Point {
  constructor(readonly x: number) {}
}

export const FOREIGN_PROPS_CASES: ScenarioCase[] = [
  // ── plain data is copied ────────────────────────────────────────────────────
  {
    id: 'foreign-props-a-plain-object-crosses-as-a-copy',
    src: 'janux',
    run: (log) => {
      const source = { level: 2 };
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, JSON.stringify(prop));
    },
    expected: ['same=false', '{"level":2}'],
  },
  {
    id: 'foreign-props-a-nested-object-is-copied-too',
    src: 'janux',
    run: (log) => {
      const inner = { deep: true };
      const { prop } = detachProps({ prop: { inner } });

      log.push(`same=${(prop as { inner: unknown }).inner === inner}`, JSON.stringify(prop));
    },
    expected: ['same=false', '{"inner":{"deep":true}}'],
  },
  {
    id: 'foreign-props-an-array-crosses-as-a-copy-of-its-items',
    src: 'janux',
    run: (log) => {
      const item = { id: 'a' };
      const { rows } = detachProps({ rows: [item] });

      log.push(`sameArray=${(rows as unknown[])[0] === item}`, JSON.stringify(rows));
    },
    expected: ['sameArray=false', '[{"id":"a"}]'],
  },
  {
    id: 'foreign-props-a-null-prototype-object-is-plain-enough-to-copy',
    src: 'janux',
    run: (log) => {
      const source = Object.assign(Object.create(null), { a: 1 });
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, JSON.stringify(prop));
    },
    expected: ['same=false', '{"a":1}'],
  },
  {
    id: 'foreign-props-a-getter-crosses-as-the-value-it-returned',
    src: 'janux',
    run: (log) => {
      let reads = 0;
      const source = {
        get total() {
          reads += 1;

          return 42;
        },
      };
      const { prop } = detachProps({ prop: source });

      // React re-reads props on every render; a live getter would run app code
      // inside React's render phase, on React's schedule.
      log.push(JSON.stringify(prop), `reads=${reads}`);
    },
    expected: ['{"total":42}', 'reads=1'],
  },
  {
    id: 'foreign-props-a-non-enumerable-field-does-not-cross',
    src: 'janux',
    run: (log) => {
      const source = Object.defineProperty({ shown: 1 }, 'hidden', { value: 2, enumerable: false });
      const { prop } = detachProps({ prop: source });

      log.push(JSON.stringify(prop));
    },
    expected: ['{"shown":1}'],
  },
  {
    id: 'foreign-props-a-proto-key-becomes-an-own-property-not-a-prototype',
    src: 'janux',
    run: (log) => {
      const source = JSON.parse('{"__proto__": {"polluted": true}}');
      const { prop } = detachProps({ prop: source });

      log.push(
        `own=${Object.prototype.hasOwnProperty.call(prop, '__proto__')}`,
        `polluted=${({} as { polluted?: boolean }).polluted}`,
      );
    },
    expected: ['own=true', 'polluted=undefined'],
  },
  {
    id: 'foreign-props-an-empty-props-bag-crosses-as-an-empty-object',
    src: 'janux',
    run: (log) => log.push(JSON.stringify(detachProps({}))),
    expected: ['{}'],
  },
  {
    id: 'foreign-props-key-order-is-preserved',
    src: 'janux',
    run: (log) => log.push(Object.keys(detachProps({ b: 1, a: 2, c: 3 })).join(',')),
    expected: ['b,a,c'],
  },

  // ── everything that is not state-shaped crosses by identity ─────────────────
  {
    id: 'foreign-props-a-date-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const when = new Date('2020-01-02T03:04:05.000Z');
      const { when: crossed } = detachProps({ when });

      log.push(`same=${crossed === when}`, `isDate=${crossed instanceof Date}`);
    },
    expected: ['same=true', 'isDate=true'],
  },
  {
    id: 'foreign-props-a-date-inside-an-array-is-still-a-date',
    src: 'janux',
    run: (log) => {
      // The guard used to apply to the PROP only, so a mapper handing over
      // `{ points: [date] }` — the shape every chart library wants — delivered
      // `[{}]` and the chart drew nothing, with no error anywhere.
      const when = new Date('2020-01-02T03:04:05.000Z');
      const { points } = detachProps({ points: [when] });
      const [crossed] = points as Date[];

      log.push(`isDate=${crossed instanceof Date}`, `same=${crossed === when}`, crossed.toISOString());
    },
    expected: ['isDate=true', 'same=true', '2020-01-02T03:04:05.000Z'],
  },
  {
    id: 'foreign-props-a-date-nested-two-objects-deep-is-still-a-date',
    src: 'janux',
    run: (log) => {
      const when = new Date('2020-01-02T03:04:05.000Z');
      const { series } = detachProps({ series: { axis: { from: when } } });

      log.push(String((series as { axis: { from: unknown } }).axis.from === when));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-map-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new Map([['a', 1]]);
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, `size=${(prop as Map<string, number>).size}`);
    },
    expected: ['same=true', 'size=1'],
  },
  {
    id: 'foreign-props-a-set-inside-an-array-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new Set([1, 2]);
      const { prop } = detachProps({ prop: [source] });

      log.push(String((prop as unknown[])[0] === source));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-regexp-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = /ab+c/gi;
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, String(prop));
    },
    expected: ['same=true', '/ab+c/gi'],
  },
  {
    id: 'foreign-props-a-class-instance-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new Point(3);
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, `isPoint=${prop instanceof Point}`);
    },
    expected: ['same=true', 'isPoint=true'],
  },
  {
    id: 'foreign-props-a-class-instance-inside-an-array-keeps-its-prototype',
    src: 'janux',
    run: (log) => {
      const { rows } = detachProps({ rows: [new Point(1), new Point(2)] });

      log.push(String((rows as Point[]).every((row) => row instanceof Point)));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-react-element-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const node = elementLike('hi');
      const { node: crossed } = detachProps({ node });

      log.push(String(crossed === node));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-children-array-keeps-every-element-identity',
    src: 'janux',
    run: (log) => {
      // React memoizes on element identity; a copied children list is a new
      // element on every render, which is a remount of the whole list.
      const first = elementLike('one');
      const second = elementLike('two');
      const { children } = detachProps({ children: [first, second] });

      log.push(String((children as unknown[])[0] === first), String((children as unknown[])[1] === second));
    },
    expected: ['true', 'true'],
  },
  {
    id: 'foreign-props-an-object-with-symbol-keys-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const marker = Symbol('marker');
      const source = { [marker]: 1, plain: 2 };
      const { prop } = detachProps({ prop: source });

      log.push(String(prop === source));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-typed-array-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new Uint8Array([1, 2, 3]);
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, `length=${(prop as Uint8Array).length}`);
    },
    expected: ['same=true', 'length=3'],
  },
  {
    id: 'foreign-props-an-array-buffer-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new ArrayBuffer(8);
      const { prop } = detachProps({ prop: source });

      log.push(String(prop === source));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-promise-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      // `use(promise)` is React's own API: a copied promise is a promise React
      // will never see settle.
      const source = Promise.resolve(1);
      const { prop } = detachProps({ prop: source });

      log.push(String(prop === source));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-an-error-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new Error('nope');
      const { prop } = detachProps({ prop: source });

      log.push(`same=${prop === source}`, `message=${(prop as Error).message}`);
    },
    expected: ['same=true', 'message=nope'],
  },

  // ── callbacks: the strict-mode exemption the boundary depends on ────────────
  {
    id: 'foreign-props-a-callback-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      // State writes reject functions outright; the props boundary must not,
      // or no foreign component could ever be handed an event handler.
      const onPick = () => 'picked';
      const { onPick: crossed } = detachProps({ onPick });

      log.push(String(crossed === onPick));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-callback-nested-in-an-options-object-still-crosses',
    src: 'janux',
    run: (log) => {
      const onPick = () => 'picked';
      const { config } = detachProps({ config: { onPick, rows: 2 } });

      log.push(String((config as { onPick: unknown }).onPick === onPick), JSON.stringify(Object.keys(config as object)));
    },
    expected: ['true', '["onPick","rows"]'],
  },
  {
    id: 'foreign-props-a-callback-inside-an-array-crosses',
    src: 'janux',
    run: (log) => {
      const first = () => 1;
      const { actions } = detachProps({ actions: [first] });

      log.push(String((actions as unknown[])[0] === first));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-symbol-value-crosses-untouched',
    src: 'janux',
    run: (log) => {
      const marker = Symbol('marker');
      const { prop } = detachProps({ prop: marker });

      log.push(String(prop === marker));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-symbol-nested-in-an-object-crosses-untouched',
    src: 'janux',
    run: (log) => {
      const marker = Symbol.for('react.fragment');
      const { prop } = detachProps({ prop: { type: marker } });

      log.push(String((prop as { type: unknown }).type === marker));
    },
    expected: ['true'],
  },

  // ── scalars, exactly as written ─────────────────────────────────────────────
  {
    id: 'foreign-props-null-and-undefined-cross-unchanged',
    src: 'janux',
    run: (log) => {
      const crossed = detachProps({ nothing: null, missing: undefined });

      log.push(String(crossed.nothing), String(crossed.missing), Object.keys(crossed).join(','));
    },
    expected: ['null', 'undefined', 'nothing,missing'],
  },
  {
    id: 'foreign-props-non-finite-numbers-cross-unchanged',
    src: 'janux',
    run: (log) => {
      const crossed = detachProps({ nan: Number.NaN, inf: Number.POSITIVE_INFINITY, neg: -0 });

      log.push(String(Number.isNaN(crossed.nan)), String(crossed.inf), String(Object.is(crossed.neg, -0)));
    },
    expected: ['true', 'Infinity', 'true'],
  },
  {
    id: 'foreign-props-a-bigint-crosses-unchanged',
    src: 'janux',
    run: (log) => {
      const { total } = detachProps({ total: 9007199254740993n });

      log.push(String(total));
    },
    expected: ['9007199254740993'],
  },
  {
    id: 'foreign-props-a-nested-bigint-survives-the-copy',
    src: 'janux',
    run: (log) => {
      const { money } = detachProps({ money: { cents: 12n } });

      log.push(String((money as { cents: bigint }).cents));
    },
    expected: ['12'],
  },

  // ── identity across renders: React memoization depends on it ────────────────
  {
    id: 'foreign-props-the-same-source-object-yields-the-same-copy-twice',
    src: 'janux',
    run: (log) => {
      const source = { id: 'a' };

      log.push(String(detachProps({ prop: source }).prop === detachProps({ prop: source }).prop));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-two-props-sharing-a-subtree-still-share-it-after-crossing',
    src: 'janux',
    run: (log) => {
      const shared = { id: 'a' };
      const crossed = detachProps({ left: { row: shared }, right: { row: shared } });

      log.push(String((crossed.left as { row: unknown }).row === (crossed.right as { row: unknown }).row));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-copy-is-reused-even-when-the-source-was-mutated-in-place',
    src: 'janux',
    run: (log) => {
      // State proxies are stable per (path, version), so an in-place mutation
      // cannot happen behind state's back — but a mapper's own object can be
      // mutated, and then what React sees is the copy taken the first time.
      const source: { id: string } = { id: 'a' };
      const first = detachProps({ prop: source }).prop;

      source.id = 'b';
      log.push(JSON.stringify(first), JSON.stringify(detachProps({ prop: source }).prop));
    },
    expected: ['{"id":"a"}', '{"id":"a"}'],
  },
  {
    id: 'foreign-props-a-self-referencing-object-crosses-as-the-same-cycle',
    src: 'janux',
    run: (log) => {
      // A graph is a legitimate prop for a foreign component (a tree view, a
      // force layout); throwing "cannot store a cycle in state" at a value
      // nobody is storing named the wrong thing entirely.
      const node: Record<string, unknown> = { name: 'root' };

      node.self = node;
      const { node: crossed } = detachProps({ node });

      log.push(`cycle=${(crossed as { self: unknown }).self === crossed}`, `copy=${crossed !== node}`);
    },
    expected: ['cycle=true', 'copy=true'],
  },
  {
    id: 'foreign-props-a-mutual-cycle-crosses-as-the-same-mutual-cycle',
    src: 'janux',
    run: (log) => {
      const left: Record<string, unknown> = { name: 'left' };
      const right: Record<string, unknown> = { name: 'right', left };

      left.right = right;
      const crossed = detachProps({ left }).left as Record<string, Record<string, unknown>>;

      log.push(String(crossed.right.left === crossed));
    },
    expected: ['true'],
  },

  // ── the freeze that killed islands: Immer, Redux Toolkit, Recharts ──────────
  {
    id: 'foreign-props-freezing-what-crossed-leaves-the-source-writable',
    src: 'janux',
    run: (log) => {
      const source: { id: string } = { id: 'a' };

      Object.freeze(detachProps({ prop: source }).prop);
      source.id = 'b';
      log.push(source.id);
    },
    expected: ['b'],
  },
  {
    id: 'foreign-props-deep-freezing-state-rows-leaves-the-island-writable',
    src: 'janux',
    run: async (log) => {
      const instance = withRows();
      const { rows } = detachProps({ rows: instance.state.rows });

      // Exactly what Immer does to whatever it is handed. Freezing a proxy
      // freezes its target: island state would be unwritable forever and every
      // later read would throw a Proxy invariant error.
      Object.freeze(rows);
      (rows as { id: string }[]).forEach((row) => Object.freeze(row));
      await instance.intents.addRow!(undefined, { origin: 'human' });
      log.push(`rows=${instance.state.rows.length}`, `frozenCopy=${Object.isFrozen(rows)}`);
    },
    expected: ['rows=2', 'frozenCopy=true'],
  },
  {
    id: 'foreign-props-a-frozen-copy-does-not-freeze-the-next-copy',
    src: 'janux',
    run: async (log) => {
      const instance = withRows();

      Object.freeze(detachProps({ rows: instance.state.rows }).rows);
      await instance.intents.addRow!(undefined, { origin: 'human' });
      const { rows } = detachProps({ rows: instance.state.rows });

      log.push(`frozen=${Object.isFrozen(rows)}`, `length=${(rows as unknown[]).length}`);
    },
    expected: ['frozen=false', 'length=2'],
  },
  {
    id: 'foreign-props-a-foreign-component-cannot-write-island-state-through-its-props',
    src: 'janux',
    run: (log) => {
      const instance = withRows();
      const { rows } = detachProps({ rows: instance.state.rows });

      // The only way in is an intent (design invariant): a mutation applied to
      // the copy must not reach the island behind the intents' back.
      (rows as { id: string }[])[0]!.id = 'hacked';
      log.push(instance.state.rows[0].id);
    },
    expected: ['a'],
  },
  {
    id: 'foreign-props-state-crosses-as-plain-json-not-as-a-proxy',
    src: 'janux',
    run: (log) => {
      const instance = withRows();
      const { rows } = detachProps({ rows: instance.state.rows });

      log.push(JSON.stringify(rows), `array=${Array.isArray(rows)}`);
    },
    expected: ['[{"id":"a"}]', 'array=true'],
  },

  // ── invalidation: React must see a change, and only a real one ─────────────
  {
    id: 'foreign-props-an-unrelated-write-does-not-produce-a-new-copy',
    src: 'janux',
    run: async (log) => {
      const instance = withRows();
      const before = detachProps({ rows: instance.state.rows }).rows;

      await instance.intents.relabel!(undefined, { origin: 'human' });
      log.push(String(detachProps({ rows: instance.state.rows }).rows === before));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-writing-the-list-produces-a-new-copy',
    src: 'janux',
    run: async (log) => {
      const instance = withRows();
      const before = detachProps({ rows: instance.state.rows }).rows;

      await instance.intents.addRow!(undefined, { origin: 'human' });
      const after = detachProps({ rows: instance.state.rows }).rows;

      log.push(`same=${after === before}`, JSON.stringify(after));
    },
    expected: ['same=false', '[{"id":"a"},{"id":"b"}]'],
  },
  {
    id: 'foreign-props-a-ten-thousand-row-list-crosses-once-and-is-reused',
    src: 'janux',
    run: (log) => {
      const rows = Array.from({ length: 10_000 }, (_, index) => ({ id: `r${index}` }));
      const first = detachProps({ rows }).rows as unknown[];
      const second = detachProps({ rows }).rows;

      log.push(`length=${first.length}`, `reused=${first === second}`);
    },
    expected: ['length=10000', 'reused=true'],
  },
  {
    id: 'foreign-props-crossing-does-not-throw-on-a-deeply-nested-tree',
    src: 'janux',
    run: (log) => {
      let tree: Record<string, unknown> = { leaf: true };

      for (let depth = 0; depth < 500; depth += 1) tree = { child: tree };
      attempt(log, 'detach', () => detachProps({ tree }));
    },
    expected: ['detach:ok'],
  },

  // ── shapes a mapper can produce that are not quite plain objects ────────────
  {
    id: 'foreign-props-a-frozen-source-object-crosses-as-a-writable-copy',
    src: 'janux',
    run: (log) => {
      // A library handing back frozen data (Immer again, from the other side)
      // must not make the copy React receives frozen too — React's own dev-mode
      // helpers write to props objects.
      const source = Object.freeze({ id: 'a' });
      const { prop } = detachProps({ prop: source });

      log.push(`frozen=${Object.isFrozen(prop)}`, JSON.stringify(prop));
    },
    expected: ['frozen=false', '{"id":"a"}'],
  },
  {
    id: 'foreign-props-a-sealed-source-object-crosses-as-an-extensible-copy',
    src: 'janux',
    run: (log) => {
      const { prop } = detachProps({ prop: Object.seal({ id: 'a' }) });

      log.push(`sealed=${Object.isSealed(prop)}`);
    },
    expected: ['sealed=false'],
  },
  {
    id: 'foreign-props-a-sparse-array-crosses-with-its-holes-filled-in',
    src: 'janux',
    run: (log) => {
      const sparse = [1, , 3] as unknown[];
      const { rows } = detachProps({ rows: sparse });

      log.push(`length=${(rows as unknown[]).length}`, `hole=${1 in (rows as unknown[])}`, JSON.stringify(rows));
    },
    expected: ['length=3', 'hole=true', '[1,null,3]'],
  },
  {
    id: 'foreign-props-a-to-json-method-does-not-decide-what-crosses',
    src: 'janux',
    run: (log) => {
      // This is not serialization: the component gets the fields, not whatever
      // the object would have become inside `JSON.stringify`.
      const source = { id: 'a', toJSON: () => ({ replaced: true }) };
      const { prop } = detachProps({ prop: source });

      log.push(Object.keys(prop as object).join(','), String((prop as { id: string }).id));
    },
    expected: ['id,toJSON', 'a'],
  },
  {
    id: 'foreign-props-an-array-like-object-crosses-as-an-object-not-an-array',
    src: 'janux',
    run: (log) => {
      const { prop } = detachProps({ prop: { 0: 'a', 1: 'b', length: 2 } });

      log.push(`array=${Array.isArray(prop)}`, JSON.stringify(prop));
    },
    expected: ['array=false', '{"0":"a","1":"b","length":2}'],
  },
  {
    id: 'foreign-props-an-empty-array-and-an-empty-object-survive-as-themselves',
    src: 'janux',
    run: (log) => {
      const crossed = detachProps({ rows: [], bag: {} });

      log.push(`array=${Array.isArray(crossed.rows)}`, JSON.stringify(crossed));
    },
    expected: ['array=true', '{"rows":[],"bag":{}}'],
  },
  {
    id: 'foreign-props-two-props-holding-the-same-date-still-hold-the-same-date',
    src: 'janux',
    run: (log) => {
      const when = new Date('2020-01-02T03:04:05Z');
      const crossed = detachProps({ from: { at: when }, to: { at: when } });

      log.push(String((crossed.from as { at: unknown }).at === (crossed.to as { at: unknown }).at));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-state-object-crosses-field-by-field-not-as-a-proxy',
    src: 'janux',
    run: (log) => {
      const instance = withRows();
      const { state } = detachProps({ state: instance.state });

      log.push(JSON.stringify(state), `proxy=${state === (instance.state as unknown)}`);
    },
    expected: ['{"rows":[{"id":"a"}],"label":"one"}', 'proxy=false'],
  },
  {
    id: 'foreign-props-reading-through-the-boundary-does-not-write-anything-back',
    src: 'janux',
    run: async (log) => {
      const instance = withRows();
      const before = JSON.stringify(instance.snapshot());

      detachProps({ state: instance.state, rows: instance.state.rows, label: instance.state.label });
      log.push(String(JSON.stringify(instance.snapshot()) === before));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-value-that-is-not-a-container-at-all-is-returned-as-is',
    src: 'janux',
    run: (log) => {
      const crossed = detachProps({ count: 3, name: 'x', flag: false });

      log.push(JSON.stringify(crossed));
    },
    expected: ['{"count":3,"name":"x","flag":false}'],
  },
  {
    id: 'foreign-props-a-weak-collection-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      const source = new WeakMap();
      const { prop } = detachProps({ prop: source });

      log.push(String(prop === source));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-getter-that-throws-fails-at-the-boundary-not-inside-react',
    src: 'janux',
    run: (log) => {
      // Better here, where the island and the prop name are still in the stack,
      // than three frames inside a library's render.
      const source = {
        get broken(): never {
          throw new Error('getter exploded');
        },
      };

      attempt(log, 'detach', () => detachProps({ prop: source }));
    },
    expected: ['detach:threw:getter exploded'],
  },
  {
    id: 'foreign-props-a-proxy-that-is-not-state-crosses-by-identity',
    src: 'janux',
    run: (log) => {
      // Another library's proxy (MobX, Valtio, an ORM entity) is that library's
      // business: copying it would strip exactly the behaviour it exists for.
      const target = new Map<string, number>();
      const source = new Proxy(target, {});
      const { prop } = detachProps({ prop: source });

      log.push(String(prop === source));
    },
    expected: ['true'],
  },
  {
    id: 'foreign-props-a-nested-array-of-arrays-is-copied-at-every-level',
    src: 'janux',
    run: (log) => {
      const inner = [1, 2];
      const grid = [[inner], [inner]];
      const { grid: crossed } = detachProps({ grid });
      const [[first], [second]] = crossed as number[][][];

      log.push(`copied=${first !== inner}`, `shared=${first === second}`, JSON.stringify(crossed));
    },
    expected: ['copied=true', 'shared=true', '[[[1,2]],[[1,2]]]'],
  },
];
