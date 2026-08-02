import { computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Signals composed into higher-order shapes: signals holding signals or
 * computeds, factories that mint per-key cells, and derived values that pick
 * WHICH signal to read. The subtle part is that only the reads performed on
 * the current run are dependencies — indirection does not change that.
 */
export const SIGNAL_COMPOSITION_CASES: ScenarioCase[] = [
  {
    id: 'rx-cm-a-signal-holding-a-computed-tracks-the-outer-and-the-inner',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const doubled = computed(() => base.value * 2);
      const slot = signal(doubled);

      watch(() => { log.push(`run:${slot.value.value}`); });
      base.value = 2;
      slot.value = computed(() => base.value * 10);
      base.value = 3;
    },
    expected: ['run:2', 'run:4', 'run:20', 'run:30'],
  },
  {
    id: 'rx-cm-replacing-the-inner-signal-detaches-the-old-one',
    src: 'janux',
    run: (log) => {
      const first = signal('a');
      const second = signal('b');
      const slot = signal(first);

      watch(() => { log.push(`run:${slot.value.value}`); });
      slot.value = second;
      log.push(`first-readers:${first.readers()}`, `second-readers:${second.readers()}`);
    },
    expected: ['run:a', 'run:b', 'first-readers:0', 'second-readers:1'],
  },
  {
    id: 'rx-cm-a-factory-mints-one-cell-per-key-and-reuses-it',
    src: 'janux',
    run: (log) => {
      const cells = new Map<string, ReturnType<typeof signal<number>>>();
      const cell = (key: string) => {
        if (!cells.has(key)) cells.set(key, signal(0));

        return cells.get(key)!;
      };

      watch(() => { log.push(`a:${cell('a').value}`); });
      cell('a').value = 1;
      log.push(`same-instance:${cell('a') === cell('a')}`, `size:${cells.size}`);
    },
    expected: ['a:0', 'a:1', 'same-instance:true', 'size:1'],
  },
  {
    id: 'rx-cm-a-computed-returning-a-signal-hands-the-reader-a-live-cell',
    src: 'janux',
    run: (log) => {
      const which = signal<'a' | 'b'>('a');
      const cells = { a: signal(1), b: signal(2) };
      const active = computed(() => cells[which.value]);

      watch(() => { log.push(`run:${active.value.value}`); });
      cells.a.value = 10;
      which.value = 'b';
      cells.b.value = 20;
    },
    expected: ['run:1', 'run:10', 'run:2', 'run:20'],
  },
  {
    id: 'rx-cm-an-array-of-computeds-derives-per-element-independently',
    src: 'janux',
    run: (log) => {
      const sources = [signal(1), signal(2)];
      const doubled = sources.map((source) => computed(() => source.value * 2));

      doubled.forEach((cell, index) => {
        watch(() => { log.push(`d${index}:${cell.value}`); });
      });
      sources[0]!.value = 5;
    },
    expected: ['d0:2', 'd1:4', 'd0:10'],
  },
  {
    id: 'rx-cm-a-derived-record-of-computeds-is-read-key-by-key',
    src: 'janux',
    run: (log) => {
      const raw = signal({ width: 2, height: 3 });
      const parts = {
        area: computed(() => raw.value.width * raw.value.height),
        ratio: computed(() => raw.value.width / raw.value.height),
      };

      watch(() => { log.push(`area:${parts.area.value}`); });
      raw.value = { width: 4, height: 3 };
      log.push(`ratio:${parts.ratio.value}`);
    },
    expected: ['area:6', 'area:12', 'ratio:1.3333333333333333'],
  },
  {
    id: 'rx-cm-a-signal-of-a-function-that-reads-another-signal-tracks-on-call',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const reader = signal(() => source.value * 2);

      watch(() => { log.push(`run:${reader.value()}`); });
      source.value = 3;
      reader.value = () => source.value * 10;
    },
    expected: ['run:2', 'run:6', 'run:30'],
  },
  {
    id: 'rx-cm-a-two-level-selector-only-tracks-the-selected-leaf',
    src: 'janux',
    run: (log) => {
      const group = signal<'x' | 'y'>('x');
      const leaves = {
        x: [signal('x1'), signal('x2')],
        y: [signal('y1')],
      };
      const index = signal(0);

      watch(() => { log.push(`run:${leaves[group.value][index.value]!.value}`); });
      log.push(`x2-readers:${leaves.x[1]!.readers()}`);
      index.value = 1;
      log.push(`x2-readers:${leaves.x[1]!.readers()}`);
    },
    expected: ['run:x1', 'x2-readers:0', 'run:x2', 'x2-readers:1'],
  },
  {
    id: 'rx-cm-a-computed-over-a-list-of-signals-recomputes-once-per-member-write',
    src: 'janux',
    run: (log) => {
      const members = [signal(1), signal(2), signal(3)];
      let computes = 0;
      const total = computed(() => {
        computes++;

        return members.reduce((sum, member) => sum + member.value, 0);
      });

      members[1]!.value = 20;
      log.push(`total:${total.value}`, `computes:${computes}`);
    },
    expected: ['total:24', 'computes:2'],
  },
  {
    id: 'rx-cm-a-lazily-added-member-joins-the-aggregate-on-the-next-recompute',
    src: 'janux',
    run: (log) => {
      const members = [signal(1)];
      const version = signal(0);
      const total = computed(() => {
        version.value;

        return members.reduce((sum, member) => sum + member.value, 0);
      });

      watch(() => { log.push(`total:${total.value}`); });
      members.push(signal(5));
      log.push('added-silently');
      version.value = 1;
    },
    expected: ['total:1', 'added-silently', 'total:6'],
  },
  {
    id: 'rx-cm-a-pair-of-mirrored-signals-stays-in-sync-through-a-derived-check',
    src: 'janux',
    run: (log) => {
      const celsius = signal(0);
      const fahrenheit = computed(() => (celsius.value * 9) / 5 + 32);
      const roundTrip = computed(() => ((fahrenheit.value - 32) * 5) / 9);

      watch(() => { log.push(`same:${roundTrip.value === celsius.value}`); });
      celsius.value = 100;
    },
    expected: ['same:true', 'same:true'],
  },
  {
    id: 'rx-cm-a-computed-chosen-at-runtime-from-a-registry-swaps-cleanly',
    src: 'janux',
    run: (log) => {
      const source = signal(4);
      const registry = {
        double: computed(() => source.value * 2),
        square: computed(() => source.value ** 2),
      };
      const mode = signal<'double' | 'square'>('double');

      watch(() => { log.push(`run:${registry[mode.value].value}`); });
      mode.value = 'square';
      source.value = 5;
    },
    expected: ['run:8', 'run:16', 'run:25'],
  },
];
