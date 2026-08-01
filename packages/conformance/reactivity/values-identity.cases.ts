import { signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Identity classes with a lesson each: values that LOOK different but are
 * `Object.is`-equal stay silent (interned strings, `Symbol.for`, bigints),
 * and values that look the same but are distinct instances always notify
 * (dates, regexps, collections, class instances).
 */
export const VALUES_IDENTITY_CASES: ScenarioCase[] = [
  {
    id: 'rx-id-symbol-for-returns-the-registered-symbol-so-the-write-is-silent',
    src: 'janux',
    run: (log) => {
      const token = signal(Symbol.for('rx-id-shared'));

      watch(() => { log.push(`run:${String(token.value.description)}`); });
      token.value = Symbol.for('rx-id-shared');
    },
    expected: ['run:rx-id-shared'],
  },
  {
    id: 'rx-id-concatenated-strings-intern-so-equal-results-are-silent',
    src: 'janux',
    run: (log) => {
      const name = signal('ab');
      const prefix = 'a';

      watch(() => { log.push(`run:${name.value}`); });
      name.value = `${prefix}b`;
    },
    expected: ['run:ab'],
  },
  {
    id: 'rx-id-two-dates-with-the-same-timestamp-still-notify',
    src: 'janux',
    run: (log) => {
      const when = signal(new Date(0));

      watch(() => { log.push(`run:${when.value.getTime()}`); });
      when.value = new Date(0);
    },
    expected: ['run:0', 'run:0'],
  },
  {
    id: 'rx-id-mutating-a-date-in-place-is-invisible',
    src: 'janux',
    run: (log) => {
      const when = signal(new Date(0));

      watch(() => { log.push(`run:${when.value.getTime()}`); });
      when.value.setTime(1000);
      log.push(`peeked:${when.peek().getTime()}`);
    },
    expected: ['run:0', 'peeked:1000'],
  },
  {
    id: 'rx-id-equivalent-regexps-are-distinct-instances-and-notify',
    src: 'janux',
    run: (log) => {
      const pattern = signal(/ab+/g);

      watch(() => { log.push(`run:${pattern.value.source}`); });
      pattern.value = /ab+/g;
    },
    expected: ['run:ab+', 'run:ab+'],
  },
  {
    id: 'rx-id-a-new-empty-map-notifies-over-an-old-empty-map',
    src: 'janux',
    run: (log) => {
      const table = signal(new Map<string, number>());

      watch(() => { log.push(`run:${table.value.size}`); });
      table.value = new Map();
    },
    expected: ['run:0', 'run:0'],
  },
  {
    id: 'rx-id-adding-to-a-map-in-place-is-invisible',
    src: 'janux',
    run: (log) => {
      const table = signal(new Map<string, number>());

      watch(() => { log.push(`run:${table.value.size}`); });
      table.value.set('key', 1);
      log.push(`peeked:${table.peek().size}`);
    },
    expected: ['run:0', 'peeked:1'],
  },
  {
    id: 'rx-id-a-frozen-object-value-round-trips-without-issue',
    src: 'janux',
    run: (log) => {
      const frozen = Object.freeze({ tag: 'v1' });
      const config = signal<{ tag: string }>(frozen);

      watch(() => { log.push(`run:${config.value.tag}`); });
      config.value = frozen;
      config.value = Object.freeze({ tag: 'v2' });
    },
    expected: ['run:v1', 'run:v2'],
  },
  {
    id: 'rx-id-class-instances-compare-by-identity-not-shape',
    src: 'janux',
    run: (log) => {
      class Point {
        constructor(public x: number) {}
      }
      const point = signal(new Point(1));

      watch(() => { log.push(`run:${point.value.x}`); });
      point.value = new Point(1);
    },
    expected: ['run:1', 'run:1'],
  },
  {
    id: 'rx-id-equal-bigints-from-different-expressions-are-silent',
    src: 'janux',
    run: (log) => {
      const big = signal(10n ** 2n);

      watch(() => { log.push(`run:${big.value}n`); });
      big.value = 100n;
    },
    expected: ['run:100n'],
  },
  {
    id: 'rx-id-a-signal-holding-a-function-swaps-behavior-on-write',
    src: 'janux',
    run: (log) => {
      const format = signal((n: number) => `#${n}`);

      watch(() => { log.push(`run:${format.value(1)}`); });
      format.value = (n: number) => `[${n}]`;
    },
    expected: ['run:#1', 'run:[1]'],
  },
  {
    id: 'rx-id-array-identity-swap-preserves-element-identities',
    src: 'janux',
    run: (log) => {
      const element = { id: 1 };
      const list = signal([element]);

      watch(() => { log.push(`run:${list.value.length}`); });
      list.value = [element, { id: 2 }];
      log.push(`shared-element:${list.peek()[0] === element}`);
    },
    expected: ['run:1', 'run:2', 'shared-element:true'],
  },
  {
    id: 'rx-id-a-new-set-with-the-same-members-notifies',
    src: 'janux',
    run: (log) => {
      const tags = signal(new Set(['a']));

      watch(() => { log.push(`run:${[...tags.value].join(',')}`); });
      tags.value = new Set(['a']);
    },
    expected: ['run:a', 'run:a'],
  },
  {
    id: 'rx-id-a-typed-array-view-over-the-same-buffer-is-a-distinct-instance',
    src: 'janux',
    run: (log) => {
      const buffer = new ArrayBuffer(4);
      const view = signal(new Uint8Array(buffer));

      watch(() => { log.push(`run:${view.value.length}`); });
      view.value = new Uint8Array(buffer);
    },
    expected: ['run:4', 'run:4'],
  },
  {
    id: 'rx-id-a-boxed-number-is-never-equal-to-its-primitive',
    src: 'janux',
    run: (log) => {
      const value = signal<number | object>(1);

      watch(() => { log.push(`run:${typeof value.value}`); });
      value.value = new Number(1);
      value.value = 1;
    },
    expected: ['run:number', 'run:object', 'run:number'],
  },
  {
    id: 'rx-id-an-object-with-a-custom-valueof-still-compares-by-identity',
    src: 'janux',
    run: (log) => {
      const make = () => ({ valueOf: () => 42 });
      const value = signal(make());

      watch(() => { log.push(`run:${value.value.valueOf()}`); });
      value.value = make();
    },
    expected: ['run:42', 'run:42'],
  },
];
