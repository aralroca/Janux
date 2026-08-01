import { batch, computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Derived graphs: chains, diamonds and the glitch-freedom guarantee — an
 * effect never observes one fresh branch and one stale one, regardless of
 * creation order or batching, and equality cuts stop propagation exactly
 * where the derived value stops changing.
 */
export const COMPUTED_CHAIN_CASES: ScenarioCase[] = [
  {
    id: 'rx-ch-three-level-chain-propagates-values',
    src: 'vue:computed#chained-computeds',
    run: (log) => {
      const base = signal(1);
      const double = computed(() => base.value * 2);
      const quad = computed(() => double.value * 2);
      const oct = computed(() => quad.value * 2);

      log.push(`initial:${oct.value}`);
      base.value = 2;
      log.push(`updated:${oct.value}`);
    },
    expected: ['initial:8', 'updated:16'],
  },
  {
    id: 'rx-ch-a-deep-chain-reruns-the-effect-once-per-source-write',
    src: 'preact:signals#chain-single-effect-run',
    run: (log) => {
      const base = signal(1);
      const l1 = computed(() => base.value + 1);
      const l2 = computed(() => l1.value + 1);
      const l3 = computed(() => l2.value + 1);

      watch(() => { log.push(`run:${l3.value}`); });
      base.value = 10;
    },
    expected: ['run:4', 'run:13'],
  },
  {
    id: 'rx-ch-diamond-effect-runs-once-with-consistent-branches',
    src: 'preact:signals#diamond-no-glitch',
    run: (log) => {
      const base = signal(1);
      const left = computed(() => base.value + 1);
      const right = computed(() => base.value + 2);

      watch(() => { log.push(`run:${left.value}:${right.value}`); });
      base.value = 10;
    },
    expected: ['run:2:3', 'run:11:12'],
  },
  {
    id: 'rx-ch-diamond-inside-a-batch-behaves-identically',
    src: 'preact:signals#batch-diamond',
    run: (log) => {
      const base = signal(1);
      const left = computed(() => base.value + 1);
      const right = computed(() => base.value + 2);

      watch(() => { log.push(`run:${left.value}:${right.value}`); });
      batch(() => {
        base.value = 10;
      });
    },
    expected: ['run:2:3', 'run:11:12'],
  },
  {
    id: 'rx-ch-half-diamond-source-plus-computed-stay-consistent',
    src: 'preact:signals#source-and-derived-consistency',
    run: (log) => {
      const base = signal(1);
      const double = computed(() => base.value * 2);

      watch(() => { log.push(`run:${base.value}:${double.value}`); });
      base.value = 5;
    },
    expected: ['run:1:2', 'run:5:10'],
  },
  {
    id: 'rx-ch-half-diamond-consistency-does-not-depend-on-creation-order',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      let double = { value: 0 } as { value: number };

      // The effect subscribes to `base` BEFORE the computed does — computeds
      // still settle first on every write, so the pair can never tear.
      watch(() => { log.push(`run:${base.value}:${double.value}`); });
      double = computed(() => base.value * 2);
      base.value = 5;
    },
    expected: ['run:1:0', 'run:5:10'],
  },
  {
    id: 'rx-ch-wide-diamond-three-branches-single-run',
    src: 'preact:signals#wide-diamond',
    run: (log) => {
      const base = signal(0);
      const branches = [1, 2, 3].map((offset) => computed(() => base.value + offset));

      watch(() => { log.push(`run:${branches.map((branch) => branch.value).join(',')}`); });
      base.value = 10;
    },
    expected: ['run:1,2,3', 'run:11,12,13'],
  },
  {
    id: 'rx-ch-diamond-tip-computed-recomputes-once-per-write',
    src: 'preact:signals#diamond-tip-single-recompute',
    run: (log) => {
      const base = signal(1);
      const left = computed(() => base.value + 1);
      const right = computed(() => base.value + 2);
      let tipComputes = 0;
      const tip = computed(() => {
        tipComputes++;

        return left.value + right.value;
      });

      base.value = 10;
      log.push(`tip:${tip.value}`, `computes:${tipComputes}`);
    },
    expected: ['tip:23', 'computes:2'],
  },
  {
    id: 'rx-ch-equality-cut-mid-chain-stops-downstream-notification',
    src: 'vue:computed#chained-equality-cut',
    run: (log) => {
      const count = signal(1);
      const scaled = computed(() => count.value * 2);
      const sign = computed(() => (scaled.value > 0 ? 'pos' : 'neg'));

      watch(() => { log.push(`run:${sign.value}`); });
      count.value = 5;
      log.push(`scaled:${scaled.value}`);
    },
    expected: ['run:pos', 'scaled:10'],
  },
  {
    id: 'rx-ch-equality-cut-at-the-first-level-stops-the-whole-chain',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const positive = computed(() => count.value > 0);
      let downstream = 0;
      const label = computed(() => {
        downstream++;

        return positive.value ? 'yes' : 'no';
      });

      watch(() => { log.push(`run:${label.value}`); });
      count.value = 2;
      count.value = 3;
      log.push(`downstream:${downstream}`);
    },
    expected: ['run:yes', 'downstream:1'],
  },
  {
    id: 'rx-ch-mid-chain-dispose-freezes-everything-downstream',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const middle = computed(() => base.value * 2);
      const tip = computed(() => middle.value * 2);

      middle.dispose();
      base.value = 5;
      log.push(`middle:${middle.value}`, `tip:${tip.value}`);
    },
    expected: ['middle:2', 'tip:4'],
  },
  {
    id: 'rx-ch-downstream-dispose-keeps-upstream-live',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const middle = computed(() => base.value * 2);
      const tip = computed(() => middle.value * 2);

      tip.dispose();
      base.value = 5;
      log.push(`middle:${middle.value}`, `tip:${tip.value}`);
    },
    expected: ['middle:10', 'tip:4'],
  },
  {
    id: 'rx-ch-two-diamonds-sharing-a-base-stay-jointly-consistent',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const inc = computed(() => base.value + 1);
      const dec = computed(() => base.value - 1);
      const doubled = computed(() => base.value * 2);
      const halvedSign = computed(() => (base.value >= 0 ? 'p' : 'n'));

      watch(() => {
        log.push(`run:${inc.value}:${dec.value}:${doubled.value}:${halvedSign.value}`);
      });
      base.value = 4;
    },
    expected: ['run:2:0:2:p', 'run:5:3:8:p'],
  },
  {
    id: 'rx-ch-an-effect-reading-middle-and-tip-sees-a-consistent-pair',
    src: 'preact:signals#multi-level-consistency',
    run: (log) => {
      const base = signal(1);
      const middle = computed(() => base.value * 2);
      const tip = computed(() => middle.value + 1);

      watch(() => { log.push(`run:${middle.value}:${tip.value}`); });
      base.value = 3;
    },
    expected: ['run:2:3', 'run:6:7'],
  },
  {
    id: 'rx-ch-peek-in-the-middle-blocks-upstream-propagation',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const upstream = computed(() => base.value * 2);
      const suffix = signal('a');
      const mixed = computed(() => `${upstream.peek()}${suffix.value}`);

      watch(() => { log.push(`run:${mixed.value}`); });
      base.value = 5;
      log.push('base-was-silent');
      suffix.value = 'b';
    },
    expected: ['run:2a', 'base-was-silent', 'run:10b'],
  },
  {
    id: 'rx-ch-per-level-recompute-counts-are-one-per-write',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const counts = [0, 0, 0];
      const l1 = computed(() => {
        counts[0]!++;

        return base.value + 1;
      });
      const l2 = computed(() => {
        counts[1]!++;

        return l1.value + 1;
      });

      computed(() => {
        counts[2]!++;

        return l2.value + 1;
      });
      base.value = 2;
      base.value = 3;
      log.push(`counts:${counts.join(',')}`);
    },
    expected: ['counts:3,3,3'],
  },
  {
    id: 'rx-ch-a-selector-computed-repoints-between-upstream-chains',
    src: 'solid:memo#dynamic-source-selection',
    run: (log) => {
      const useLeft = signal(true);
      const leftBase = signal('l1');
      const rightBase = signal('r1');
      const left = computed(() => leftBase.value.toUpperCase());
      const right = computed(() => rightBase.value.toUpperCase());
      const picked = computed(() => (useLeft.value ? left.value : right.value));

      watch(() => { log.push(`run:${picked.value}`); });
      useLeft.value = false;
      leftBase.value = 'l2';
      rightBase.value = 'r2';
    },
    expected: ['run:L1', 'run:R1', 'run:R2'],
  },
  {
    id: 'rx-ch-diamond-with-one-cutting-branch-still-runs-once',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const scaled = computed(() => base.value * 2);
      const positive = computed(() => base.value > 0);

      watch(() => { log.push(`run:${scaled.value}:${positive.value}`); });
      base.value = 2;
    },
    expected: ['run:2:true', 'run:4:true'],
  },
  {
    id: 'rx-ch-same-value-source-write-recomputes-no-level',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      let computes = 0;
      const l1 = computed(() => {
        computes++;

        return base.value * 2;
      });

      computed(() => {
        computes++;

        return l1.value * 2;
      });
      base.value = 1;
      log.push(`computes:${computes}`);
    },
    expected: ['computes:2'],
  },
  {
    id: 'rx-ch-two-sources-into-one-tip-batch-coalesces-unbatched-does-not',
    src: 'janux',
    run: (log) => {
      const x = signal(1);
      const y = signal(1);
      const left = computed(() => x.value * 10);
      const right = computed(() => y.value * 100);
      const tip = computed(() => left.value + right.value);

      watch(() => { log.push(`run:${tip.value}`); });
      x.value = 2;
      y.value = 2;
      batch(() => {
        x.value = 3;
        y.value = 3;
      });
    },
    expected: ['run:110', 'run:120', 'run:220', 'run:330'],
  },
  {
    id: 'rx-ch-a-tip-reading-both-the-chain-and-the-raw-source-recomputes-once',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const middle = computed(() => base.value * 2);
      let tipComputes = 0;
      const tip = computed(() => {
        tipComputes++;

        return `${base.value}:${middle.value}`;
      });

      base.value = 4;
      log.push(`tip:${tip.value}`, `computes:${tipComputes}`);
    },
    expected: ['tip:4:8', 'computes:2'],
  },
  {
    id: 'rx-ch-triangle-where-the-right-branch-reads-the-left-stays-consistent',
    src: 'preact:signals#asymmetric-diamond',
    run: (log) => {
      const base = signal(1);
      const left = computed(() => base.value + 1);
      const right = computed(() => left.value + base.value);

      watch(() => { log.push(`run:${right.value}`); });
      base.value = 10;
    },
    expected: ['run:3', 'run:21'],
  },
  {
    id: 'rx-ch-a-cascade-through-an-effect-written-signal-stays-glitch-free',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const relay = signal(0);
      const derived = computed(() => relay.value * 2);

      watch(() => { relay.value = source.value * 10; });
      watch(() => { log.push(`run:${relay.value}:${derived.value}`); });
      source.value = 2;
    },
    expected: ['run:10:20', 'run:20:40'],
  },
  {
    id: 'rx-ch-chain-of-five-levels-value-integrity',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      let tip = computed(() => base.value);

      for (let level = 0; level < 4; level++) {
        const previous = tip;

        tip = computed(() => previous.value + 1);
      }
      log.push(`initial:${tip.value}`);
      base.value = 100;
      log.push(`updated:${tip.value}`);
    },
    expected: ['initial:4', 'updated:104'],
  },
  {
    id: 'rx-ch-a-diamond-where-both-branches-cut-never-reruns-the-effect',
    src: 'janux',
    run: (log) => {
      const base = signal(5);
      const positive = computed(() => base.value > 0);
      const small = computed(() => base.value < 100);

      watch(() => { log.push(`run:${positive.value}:${small.value}`); });
      base.value = 6;
      base.value = 7;
      log.push('done');
    },
    expected: ['run:true:true', 'done'],
  },
  {
    id: 'rx-ch-a-shared-mid-level-recomputes-once-for-two-tips',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      let midComputes = 0;
      const mid = computed(() => {
        midComputes++;

        return base.value * 2;
      });
      const tipA = computed(() => mid.value + 1);
      const tipB = computed(() => mid.value + 2);

      base.value = 3;
      log.push(`a:${tipA.value}`, `b:${tipB.value}`, `mid-computes:${midComputes}`);
    },
    expected: ['a:7', 'b:8', 'mid-computes:2'],
  },
  {
    id: 'rx-ch-an-uneven-depth-diamond-still-lands-consistent',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const shallow = computed(() => base.value + 1);
      const mid = computed(() => base.value * 2);
      const deep = computed(() => mid.value + 1);

      watch(() => { log.push(`run:${shallow.value}:${deep.value}`); });
      base.value = 10;
    },
    expected: ['run:2:3', 'run:11:21'],
  },
];
