import { computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * What a computed's RESULT type does to propagation: primitives dedupe
 * naturally under `Object.is` (derived strings, clamped numbers, parities),
 * while freshly-allocated objects always notify — the difference decides
 * whether a downstream effect re-renders.
 */
export const COMPUTED_EQUALITY_CASES: ScenarioCase[] = [
  {
    id: 'rx-ce-a-derived-template-string-dedupes-when-inputs-round-trip',
    src: 'janux',
    run: (log) => {
      const first = signal('a');
      const last = signal('b');
      const full = computed(() => `${first.value}-${last.value}`);

      watch(() => { log.push(`run:${full.value}`); });
      first.value = 'x';
      first.value = 'a';
    },
    expected: ['run:a-b', 'run:x-b', 'run:a-b'],
  },
  {
    id: 'rx-ce-a-clamped-number-goes-silent-past-the-cap',
    src: 'janux',
    run: (log) => {
      const raw = signal(1);
      const clamped = computed(() => Math.min(raw.value, 5));

      watch(() => { log.push(`run:${clamped.value}`); });
      raw.value = 5;
      raw.value = 50;
      raw.value = 500;
    },
    expected: ['run:1', 'run:5'],
  },
  {
    id: 'rx-ce-a-floored-ratio-notifies-only-on-integer-transitions',
    src: 'janux',
    run: (log) => {
      const pixels = signal(0);
      const page = computed(() => Math.floor(pixels.value / 100));

      watch(() => { log.push(`page:${page.value}`); });
      pixels.value = 50;
      pixels.value = 99;
      pixels.value = 100;
      pixels.value = 150;
    },
    expected: ['page:0', 'page:1'],
  },
  {
    id: 'rx-ce-a-derived-boolean-notifies-only-on-threshold-crossings',
    src: 'janux',
    run: (log) => {
      const stock = signal(10);
      const empty = computed(() => stock.value === 0);

      watch(() => { log.push(`empty:${empty.value}`); });
      stock.value = 5;
      stock.value = 0;
      stock.value = 3;
    },
    expected: ['empty:false', 'empty:true', 'empty:false'],
  },
  {
    id: 'rx-ce-a-derived-json-string-notifies-on-every-structural-change',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const body = computed(() => JSON.stringify({ count: count.value }));

      watch(() => { log.push(`run:${body.value}`); });
      count.value = 2;
    },
    expected: ['run:{"count":1}', 'run:{"count":2}'],
  },
  {
    id: 'rx-ce-a-derived-array-allocation-notifies-even-when-contents-match',
    src: 'janux',
    run: (log) => {
      const size = signal(2);
      const range = computed(() => Array.from({ length: 2 }, (_, i) => i * size.value));

      watch(() => { log.push(`run:${range.value.join(',')}`); });
      size.value = 3;
      size.value = 2;
    },
    expected: ['run:0,2', 'run:0,3', 'run:0,2'],
  },
  {
    id: 'rx-ce-a-derived-null-to-undefined-transition-notifies',
    src: 'janux',
    run: (log) => {
      const mode = signal<'n' | 'u'>('n');
      const nothing = computed(() => (mode.value === 'n' ? null : undefined));

      watch(() => { log.push(`run:${String(nothing.value)}`); });
      mode.value = 'u';
    },
    expected: ['run:null', 'run:undefined'],
  },
  {
    id: 'rx-ce-a-fresh-symbol-per-recompute-always-notifies',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const token = computed(() => Symbol(`v${count.value > 0 ? 'p' : 'n'}`));

      watch(() => { log.push(`run:${String(token.value.description)}`); });
      count.value = 2;
    },
    expected: ['run:vp', 'run:vp'],
  },
  {
    id: 'rx-ce-derived-bigint-equality-is-by-value',
    src: 'janux',
    run: (log) => {
      const count = signal(2);
      const squared = computed(() => BigInt(count.value) ** 2n);

      watch(() => { log.push(`run:${squared.value}n`); });
      count.value = -2;
    },
    expected: ['run:4n'],
  },
  {
    id: 'rx-ce-a-derived-string-case-normalization-dedupes-case-only-changes',
    src: 'janux',
    run: (log) => {
      const raw = signal('Ada');
      const slug = computed(() => raw.value.toLowerCase());

      watch(() => { log.push(`slug:${slug.value}`); });
      raw.value = 'ADA';
      raw.value = 'aDa';
      raw.value = 'Grace';
    },
    expected: ['slug:ada', 'slug:grace'],
  },
  {
    id: 'rx-ce-a-derived-length-notifies-only-when-the-count-changes',
    src: 'janux',
    run: (log) => {
      const items = signal(['a']);
      const count = computed(() => items.value.length);

      watch(() => { log.push(`count:${count.value}`); });
      items.value = ['b'];
      items.value = ['b', 'c'];
    },
    expected: ['count:1', 'count:2'],
  },
  {
    id: 'rx-ce-derived-nan-from-different-inputs-stays-silent',
    src: 'janux',
    run: (log) => {
      const denominator = signal(0);
      const ratio = computed(() => 0 / denominator.value);

      watch(() => { log.push(`run:${ratio.value}`); });
      denominator.value = -0;
    },
    expected: ['run:NaN'],
  },
  {
    id: 'rx-ce-a-derived-date-object-notifies-even-for-the-same-instant',
    src: 'janux',
    run: (log) => {
      const stamp = signal(0);
      const asDate = computed(() => new Date(Math.floor(stamp.value / 1000) * 1000));

      watch(() => { log.push(`run:${asDate.value.getTime()}`); });
      stamp.value = 500;
    },
    expected: ['run:0', 'run:0'],
  },
  {
    id: 'rx-ce-a-derived-joined-key-dedupes-reordered-inputs-only-when-the-string-matches',
    src: 'janux',
    run: (log) => {
      const parts = signal(['a', 'b']);
      const key = computed(() => [...parts.value].sort().join('|'));

      watch(() => { log.push(`key:${key.value}`); });
      parts.value = ['b', 'a'];
      parts.value = ['b', 'c'];
    },
    expected: ['key:a|b', 'key:b|c'],
  },
  {
    id: 'rx-ce-a-derived-boolean-from-a-string-length-dedupes-across-many-inputs',
    src: 'janux',
    run: (log) => {
      const text = signal('');
      const empty = computed(() => text.value.length === 0);

      watch(() => { log.push(`empty:${empty.value}`); });
      text.value = 'a';
      text.value = 'ab';
      text.value = '';
    },
    expected: ['empty:true', 'empty:false', 'empty:true'],
  },
  {
    id: 'rx-ce-a-derived-negative-zero-versus-zero-difference-notifies-once',
    src: 'janux',
    run: (log) => {
      const sign = signal(1);
      const zero = computed(() => 0 * sign.value);

      watch(() => { log.push(`run:${Object.is(zero.value, -0) ? '-0' : '0'}`); });
      sign.value = -1;
      sign.value = -2;
    },
    expected: ['run:0', 'run:-0'],
  },
];
