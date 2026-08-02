import { batch, computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Consistency invariants across a whole graph read: whatever an observer reads
 * during one run belongs to a single coherent state. Each case observes the
 * graph from a different vantage point (effect, computed, mid-batch read, a
 * cascade) and asserts that the derived values agree with their sources.
 */
export const COMPUTED_CONSISTENCY_CASES: ScenarioCase[] = [
  {
    id: 'rx-cs-an-invariant-between-two-derived-values-never-breaks-mid-flush',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const doubled = computed(() => base.value * 2);
      const quadrupled = computed(() => base.value * 4);

      watch(() => {
        log.push(`holds:${quadrupled.value === doubled.value * 2}`);
      });
      base.value = 7;
      base.value = 11;
    },
    expected: ['holds:true', 'holds:true', 'holds:true'],
  },
  {
    id: 'rx-cs-a-derived-value-agrees-with-its-source-inside-the-same-run',
    src: 'janux',
    run: (log) => {
      const base = signal(2);
      const doubled = computed(() => base.value * 2);

      watch(() => { log.push(`agrees:${doubled.value === base.value * 2}`); });
      base.value = 5;
    },
    expected: ['agrees:true', 'agrees:true'],
  },
  {
    id: 'rx-cs-a-tip-computed-observes-consistent-branch-values',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const left = computed(() => base.value + 1);
      const right = computed(() => base.value + 2);
      const tip = computed(() => right.value - left.value);

      watch(() => { log.push(`delta:${tip.value}`); });
      base.value = 100;
      base.value = -100;
    },
    expected: ['delta:1'],
  },
  {
    id: 'rx-cs-a-mid-batch-read-of-two-derived-values-is-jointly-fresh',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const left = computed(() => base.value * 2);
      const right = computed(() => base.value * 3);

      batch(() => {
        base.value = 10;
        log.push(`pair:${left.value}:${right.value}`);
      });
    },
    expected: ['pair:20:30'],
  },
  {
    id: 'rx-cs-a-cascade-writer-sees-derived-values-of-the-value-it-just-wrote',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const relay = signal(1);
      const derived = computed(() => relay.value * 10);

      watch(() => {
        relay.value = source.value;
      });
      watch(() => { log.push(`consistent:${derived.value === relay.value * 10}`); });
      source.value = 4;
    },
    expected: ['consistent:true', 'consistent:true'],
  },
  {
    id: 'rx-cs-a-three-source-aggregate-is-never-observed-half-updated',
    src: 'janux',
    run: (log) => {
      const a = signal(1);
      const b = signal(1);
      const c = signal(1);
      const total = computed(() => a.value + b.value + c.value);

      watch(() => { log.push(`matches:${total.value === a.value + b.value + c.value}`); });
      batch(() => {
        a.value = 10;
        b.value = 20;
        c.value = 30;
      });
    },
    expected: ['matches:true', 'matches:true'],
  },
  {
    id: 'rx-cs-an-effect-reading-a-chain-out-of-order-still-sees-one-state',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const mid = computed(() => base.value + 1);
      const tip = computed(() => mid.value + 1);

      watch(() => {
        // Deliberately reads the deepest level first.
        const seenTip = tip.value;
        const seenMid = mid.value;

        log.push(`chain:${seenTip - seenMid === 1 && seenMid - base.value === 1}`);
      });
      base.value = 50;
    },
    expected: ['chain:true', 'chain:true'],
  },
  {
    id: 'rx-cs-two-effects-in-the-same-flush-observe-the-same-derived-state',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const derived = computed(() => base.value * 3);
      const seen: number[] = [];

      watch(() => {
        seen.push(derived.value);
      });
      watch(() => {
        seen.push(derived.value);
      });
      base.value = 5;
      log.push(`pairs:${seen.join(',')}`);
    },
    expected: ['pairs:3,3,15,15'],
  },
  {
    id: 'rx-cs-a-computed-reading-both-a-source-and-its-own-upstream-derived-agrees',
    src: 'janux',
    run: (log) => {
      const base = signal(2);
      const half = computed(() => base.value / 2);
      const check = computed(() => half.value * 2 === base.value);

      watch(() => { log.push(`ok:${check.value}`); });
      base.value = 8;
      base.value = 9;
    },
    expected: ['ok:true'],
  },
  {
    id: 'rx-cs-a-derived-pair-tuple-is-updated-atomically',
    src: 'janux',
    run: (log) => {
      const x = signal(1);
      const y = signal(2);
      const point = computed(() => `${x.value},${y.value}`);

      watch(() => { log.push(`point:${point.value}`); });
      batch(() => {
        x.value = 10;
        y.value = 20;
      });
    },
    expected: ['point:1,2', 'point:10,20'],
  },
  {
    id: 'rx-cs-a-disposed-branch-does-not-break-the-remaining-invariant',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const live = computed(() => base.value * 2);
      const frozen = computed(() => base.value * 3);

      frozen.dispose();
      watch(() => {
        log.push(`live-fresh:${live.value === base.value * 2}`, `frozen-stale:${frozen.value === 3}`);
      });
      base.value = 4;
    },
    expected: [
      'live-fresh:true',
      'frozen-stale:true',
      'live-fresh:true',
      'frozen-stale:true',
    ],
  },
  {
    id: 'rx-cs-a-write-during-a-flush-does-not-tear-the-graph-for-the-next-effect',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const relay = signal(0);
      const derived = computed(() => relay.value + 1);

      watch(() => {
        relay.value = source.value * 10;
      });
      watch(() => { log.push(`tied:${derived.value === relay.value + 1}`); });
      source.value = 3;
    },
    expected: ['tied:true', 'tied:true'],
  },
];
