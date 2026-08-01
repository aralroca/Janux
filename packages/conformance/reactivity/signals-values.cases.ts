import { signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Value semantics of `signal` itself: what counts as a change (`Object.is`
 * across the whole type lattice), what a read returns and when, and what
 * `peek` observes. The dedupe decision is the gate every propagation case in
 * the rest of the corpus stands on, so it gets pinned per value class here.
 */
export const SIGNAL_VALUE_CASES: ScenarioCase[] = [
  {
    id: 'rx-eq-string-change-notifies',
    src: 'vue:ref#should-be-reactive',
    run: (log) => {
      const name = signal('a');

      watch(() => { log.push(`run:${name.value}`); });
      name.value = 'b';
    },
    expected: ['run:a', 'run:b'],
  },
  {
    id: 'rx-eq-same-string-is-silent',
    src: 'vue:ref#same-string-no-trigger',
    run: (log) => {
      const name = signal('a');

      watch(() => { log.push(`run:${name.value}`); });
      name.value = 'a';
    },
    expected: ['run:a'],
  },
  {
    id: 'rx-eq-boolean-toggle-notifies',
    src: 'vue:ref#boolean-toggle',
    run: (log) => {
      const on = signal(false);

      watch(() => { log.push(`run:${on.value}`); });
      on.value = true;
    },
    expected: ['run:false', 'run:true'],
  },
  {
    id: 'rx-eq-same-boolean-is-silent',
    src: 'janux',
    run: (log) => {
      const on = signal(true);

      watch(() => { log.push(`run:${on.value}`); });
      on.value = true;
    },
    expected: ['run:true'],
  },
  {
    id: 'rx-eq-number-to-numeric-string-notifies',
    src: 'vue:ref#no-type-coercion',
    run: (log) => {
      const value = signal<number | string>(1);

      watch(() => { log.push(`run:${typeof value.value}:${value.value}`); });
      value.value = '1';
    },
    expected: ['run:number:1', 'run:string:1'],
  },
  {
    id: 'rx-eq-zero-to-false-notifies-across-falsy-types',
    src: 'janux',
    run: (log) => {
      const value = signal<number | boolean>(0);

      watch(() => { log.push(`run:${typeof value.value}`); });
      value.value = false;
    },
    expected: ['run:number', 'run:boolean'],
  },
  {
    id: 'rx-eq-nan-initial-value-reads-back',
    src: 'janux',
    run: (log) => {
      log.push(String(signal(Number.NaN).value));
    },
    expected: ['NaN'],
  },
  {
    id: 'rx-eq-nan-to-number-notifies',
    src: 'vue:ref#nan-to-value',
    run: (log) => {
      const value = signal(Number.NaN);

      watch(() => { log.push(`run:${value.value}`); });
      value.value = 0;
    },
    expected: ['run:NaN', 'run:0'],
  },
  {
    id: 'rx-eq-number-to-nan-notifies',
    src: 'vue:ref#value-to-nan',
    run: (log) => {
      const value = signal(0);

      watch(() => { log.push(`run:${value.value}`); });
      value.value = Number.NaN;
    },
    expected: ['run:0', 'run:NaN'],
  },
  {
    id: 'rx-eq-infinity-to-negative-infinity-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal(Number.POSITIVE_INFINITY);

      watch(() => { log.push(`run:${value.value}`); });
      value.value = Number.NEGATIVE_INFINITY;
    },
    expected: ['run:Infinity', 'run:-Infinity'],
  },
  {
    id: 'rx-eq-same-infinity-is-silent',
    src: 'janux',
    run: (log) => {
      const value = signal(Number.POSITIVE_INFINITY);

      watch(() => { log.push(`run:${value.value}`); });
      value.value = Number.POSITIVE_INFINITY;
    },
    expected: ['run:Infinity'],
  },
  {
    id: 'rx-eq-bigint-equal-value-is-silent',
    src: 'janux',
    run: (log) => {
      const value = signal(1n);

      watch(() => { log.push(`run:${value.value}n`); });
      value.value = 1n;
    },
    expected: ['run:1n'],
  },
  {
    id: 'rx-eq-bigint-value-change-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal(1n);

      watch(() => { log.push(`run:${value.value}n`); });
      value.value = 2n;
    },
    expected: ['run:1n', 'run:2n'],
  },
  {
    id: 'rx-eq-same-symbol-is-silent',
    src: 'janux',
    run: (log) => {
      const token = Symbol('t');
      const value = signal(token);

      watch(() => { log.push(`run:${String(value.value.description)}`); });
      value.value = token;
    },
    expected: ['run:t'],
  },
  {
    id: 'rx-eq-new-symbol-with-same-description-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal(Symbol('t'));

      watch(() => { log.push(`run:${String(value.value.description)}`); });
      value.value = Symbol('t');
    },
    expected: ['run:t', 'run:t'],
  },
  {
    id: 'rx-eq-same-function-reference-is-silent',
    src: 'janux',
    run: (log) => {
      const handler = () => 1;
      const value = signal(handler);

      watch(() => { log.push(`run:${value.value()}`); });
      value.value = handler;
    },
    expected: ['run:1'],
  },
  {
    id: 'rx-eq-identical-source-function-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal(() => 1);

      watch(() => { log.push(`run:${value.value()}`); });
      value.value = () => 1;
    },
    expected: ['run:1', 'run:1'],
  },
  {
    id: 'rx-eq-same-array-reference-is-silent',
    src: 'vue:ref#array-identity',
    run: (log) => {
      const items = [1, 2];
      const value = signal(items);

      watch(() => { log.push(`run:${value.value.length}`); });
      value.value = items;
    },
    expected: ['run:2'],
  },
  {
    id: 'rx-eq-structurally-equal-arrays-notify',
    src: 'vue:ref#no-deep-array-compare',
    run: (log) => {
      const value = signal([1, 2]);

      watch(() => { log.push(`run:${JSON.stringify(value.value)}`); });
      value.value = [1, 2];
    },
    expected: ['run:[1,2]', 'run:[1,2]'],
  },
  {
    id: 'rx-eq-in-place-array-mutation-is-invisible',
    src: 'janux',
    run: (log) => {
      const value = signal([1]);

      watch(() => { log.push(`run:${value.value.length}`); });
      value.value.push(2);
      log.push(`peeked-length:${value.peek().length}`);
    },
    expected: ['run:1', 'peeked-length:2'],
  },
  {
    id: 'rx-eq-in-place-object-mutation-is-invisible',
    src: 'janux',
    run: (log) => {
      const value = signal({ count: 0 });

      watch(() => { log.push(`run:${value.value.count}`); });
      value.value.count = 5;
      log.push(`peeked:${value.peek().count}`);
    },
    expected: ['run:0', 'peeked:5'],
  },
  {
    id: 'rx-eq-peek-returns-value-before-any-subscriber-exists',
    src: 'preact:signals#peek-without-subscribers',
    run: (log) => {
      log.push(String(signal(7).peek()));
    },
    expected: ['7'],
  },
  {
    id: 'rx-eq-peek-sees-a-write-immediately',
    src: 'janux',
    run: (log) => {
      const value = signal(1);

      value.value = 2;
      log.push(`peek:${value.peek()}`);
    },
    expected: ['peek:2'],
  },
  {
    id: 'rx-eq-write-read-roundtrip-is-synchronous',
    src: 'vue:ref#sync-read-after-write',
    run: (log) => {
      const value = signal('old');

      value.value = 'new';
      log.push(value.value);
    },
    expected: ['new'],
  },
  {
    id: 'rx-eq-consecutive-distinct-writes-each-notify',
    src: 'vue:effect#each-change-triggers',
    run: (log) => {
      const value = signal(0);

      watch(() => { log.push(`run:${value.value}`); });
      value.value = 1;
      value.value = 2;
      value.value = 3;
    },
    expected: ['run:0', 'run:1', 'run:2', 'run:3'],
  },
  {
    id: 'rx-eq-unbatched-round-trip-notifies-both-legs',
    src: 'janux',
    run: (log) => {
      const value = signal('a');

      watch(() => { log.push(`run:${value.value}`); });
      value.value = 'b';
      value.value = 'a';
    },
    expected: ['run:a', 'run:b', 'run:a'],
  },
  {
    id: 'rx-eq-undefined-initial-value-is-readable',
    src: 'janux',
    run: (log) => {
      log.push(String(signal(undefined).value));
    },
    expected: ['undefined'],
  },
  {
    id: 'rx-eq-undefined-over-undefined-is-silent',
    src: 'janux',
    run: (log) => {
      const value = signal<undefined | string>(undefined);

      watch(() => { log.push(`run:${String(value.value)}`); });
      value.value = undefined;
    },
    expected: ['run:undefined'],
  },
  {
    id: 'rx-eq-null-over-null-is-silent',
    src: 'janux',
    run: (log) => {
      const value = signal<null | string>(null);

      watch(() => { log.push(`run:${String(value.value)}`); });
      value.value = null;
    },
    expected: ['run:null'],
  },
  {
    id: 'rx-eq-write-with-no-subscribers-is-safe',
    src: 'janux',
    run: (log) => {
      const value = signal(0);

      attempt(log, 'write', () => (value.value = 1));
      log.push(`now:${value.peek()}`);
    },
    expected: ['write:ok', 'now:1'],
  },
  {
    id: 'rx-eq-two-signals-do-not-interfere',
    src: 'vue:effect#unrelated-signal-is-silent',
    run: (log) => {
      const a = signal('a');
      const b = signal('b');

      watch(() => { log.push(`run:${a.value}`); });
      b.value = 'b2';
      a.value = 'a2';
    },
    expected: ['run:a', 'run:a2'],
  },
  {
    id: 'rx-eq-undefined-to-null-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal<null | undefined>(undefined);

      watch(() => { log.push(`run:${String(value.value)}`); });
      value.value = null;
    },
    expected: ['run:undefined', 'run:null'],
  },
  {
    id: 'rx-eq-truthy-object-to-primitive-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal<object | number>({});

      watch(() => { log.push(`run:${typeof value.value}`); });
      value.value = 1;
    },
    expected: ['run:object', 'run:number'],
  },
  {
    id: 'rx-eq-peek-after-notify-matches-tracked-read',
    src: 'janux',
    run: (log) => {
      const value = signal(1);

      watch(() => { log.push(`tracked:${value.value}:peek:${value.peek()}`); });
      value.value = 2;
    },
    expected: ['tracked:1:peek:1', 'tracked:2:peek:2'],
  },
  {
    id: 'rx-eq-write-inside-read-expression-uses-final-value',
    src: 'janux',
    run: (log) => {
      const value = signal(1);

      value.value = value.value + 1;
      log.push(`now:${value.value}`);
    },
    expected: ['now:2'],
  },
  {
    id: 'rx-eq-each-signal-instance-has-independent-state',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const second = signal(0);

      first.value = 1;
      log.push(`first:${first.value}`, `second:${second.value}`);
    },
    expected: ['first:1', 'second:0'],
  },
  {
    id: 'rx-eq-string-to-string-object-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal<string | object>('x');

      watch(() => { log.push(`run:${typeof value.value}`); });
      value.value = new String('x');
    },
    expected: ['run:string', 'run:object'],
  },
  {
    id: 'rx-eq-shared-value-across-two-signals-stays-identity-equal',
    src: 'janux',
    run: (log) => {
      const shared = { n: 1 };
      const a = signal(shared);
      const b = signal(shared);

      log.push(`same:${a.value === b.value}`);
      a.value = { n: 1 };
      log.push(`same-after:${a.peek() === b.peek()}`);
    },
    expected: ['same:true', 'same-after:false'],
  },
  {
    id: 'rx-eq-negative-zero-round-trip-back-to-zero-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal(-0);

      watch(() => { log.push(`run:${Object.is(value.value, -0) ? '-0' : '0'}`); });
      value.value = 0;
    },
    expected: ['run:-0', 'run:0'],
  },
  {
    id: 'rx-eq-max-safe-integer-boundary-write-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal(Number.MAX_SAFE_INTEGER);

      watch(() => { log.push(`run:${value.value}`); });
      value.value = Number.MAX_SAFE_INTEGER + 1;
    },
    expected: ['run:9007199254740991', 'run:9007199254740992'],
  },
  {
    id: 'rx-eq-unicode-nfc-and-nfd-forms-are-different-strings',
    src: 'janux',
    run: (log) => {
      const name = signal('é');

      watch(() => { log.push(`run:${name.value.length}`); });
      name.value = 'é';
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'rx-eq-identical-surrogate-pair-strings-are-silent',
    src: 'janux',
    run: (log) => {
      const emoji = signal('\u{1f600}');

      watch(() => { log.push(`run:${emoji.value.length}`); });
      emoji.value = '\u{1f600}';
    },
    expected: ['run:2'],
  },
  {
    id: 'rx-eq-float-artifacts-are-real-changes',
    src: 'janux',
    run: (log) => {
      const total = signal(0.3);

      watch(() => { log.push(`run:${total.value === 0.3}`); });
      total.value = 0.1 + 0.2;
    },
    expected: ['run:true', 'run:false'],
  },
  {
    id: 'rx-eq-string-case-differences-notify',
    src: 'janux',
    run: (log) => {
      const name = signal('ada');

      watch(() => { log.push(`run:${name.value}`); });
      name.value = 'Ada';
    },
    expected: ['run:ada', 'run:Ada'],
  },
  {
    id: 'rx-eq-trailing-whitespace-is-a-change',
    src: 'janux',
    run: (log) => {
      const input = signal('a');

      watch(() => { log.push(`run:[${input.value}]`); });
      input.value = 'a ';
    },
    expected: ['run:[a]', 'run:[a ]'],
  },
  {
    id: 'rx-eq-true-to-one-notifies-across-truthy-types',
    src: 'janux',
    run: (log) => {
      const flag = signal<boolean | number>(true);

      watch(() => { log.push(`run:${typeof flag.value}`); });
      flag.value = 1;
    },
    expected: ['run:boolean', 'run:number'],
  },
  {
    id: 'rx-eq-arithmetic-that-produces-negative-zero-notifies-over-zero',
    src: 'janux',
    run: (log) => {
      const scale = signal(0);

      watch(() => { log.push(`run:${Object.is(scale.value, -0) ? '-0' : String(scale.value)}`); });
      scale.value = 0 * -1;
    },
    expected: ['run:0', 'run:-0'],
  },
  {
    id: 'rx-eq-the-write-expression-evaluates-to-the-assigned-value',
    src: 'solid:signals#set-signal-returns-argument',
    run: (log) => {
      const count = signal(0);

      log.push(`assigned:${(count.value = 5)}`, `stored:${count.value}`);
    },
    expected: ['assigned:5', 'stored:5'],
  },
];
