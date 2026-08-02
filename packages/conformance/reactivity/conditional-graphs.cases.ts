import { computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Branch-shaped graphs where the SET of live dependencies is itself derived.
 * Each case is a different topology of "who is listening right now", the class
 * of bug where a detached branch keeps notifying or a re-attached one does not.
 */
export const CONDITIONAL_GRAPH_CASES: ScenarioCase[] = [
  {
    id: 'rx-cg-a-computed-gate-in-front-of-an-effect-detaches-the-inner-branch',
    src: 'janux',
    run: (log) => {
      const enabled = signal(true);
      const gate = computed(() => enabled.value);
      const payload = signal('a');

      watch(() => { log.push(`run:${gate.value ? payload.value : 'off'}`); });
      enabled.value = false;
      payload.value = 'b';
      log.push(`payload-readers:${payload.readers()}`);
    },
    expected: ['run:a', 'run:off', 'payload-readers:0'],
  },
  {
    id: 'rx-cg-a-two-stage-gate-only-reaches-the-leaf-when-both-are-open',
    src: 'janux',
    run: (log) => {
      const outer = signal(false);
      const inner = signal(false);
      const leaf = signal(0);

      watch(() => {
        if (!outer.value) {
          log.push('outer-closed');

          return;
        }
        if (!inner.value) {
          log.push('inner-closed');

          return;
        }
        log.push(`leaf:${leaf.value}`);
      });
      leaf.value = 1;
      outer.value = true;
      inner.value = true;
      leaf.value = 2;
    },
    expected: ['outer-closed', 'inner-closed', 'leaf:1', 'leaf:2'],
  },
  {
    id: 'rx-cg-an-early-return-drops-every-dependency-after-it',
    src: 'janux',
    run: (log) => {
      const stop = signal(false);
      const after = signal(0);

      watch(() => {
        if (stop.value) {
          log.push('stopped');

          return;
        }
        log.push(`after:${after.value}`);
      });
      stop.value = true;
      after.value = 1;
      log.push(`after-readers:${after.readers()}`);
    },
    expected: ['after:0', 'stopped', 'after-readers:0'],
  },
  {
    id: 'rx-cg-a-computed-branch-swap-moves-the-subscription-between-computeds',
    src: 'janux',
    run: (log) => {
      const which = signal<'a' | 'b'>('a');
      const aSource = signal(1);
      const bSource = signal(10);
      const a = computed(() => aSource.value * 2);
      const b = computed(() => bSource.value * 2);

      watch(() => { log.push(`run:${which.value === 'a' ? a.value : b.value}`); });
      which.value = 'b';
      aSource.value = 5;
      bSource.value = 20;
    },
    expected: ['run:2', 'run:20', 'run:40'],
  },
  {
    id: 'rx-cg-a-loop-bound-by-a-signal-subscribes-exactly-the-visited-cells',
    src: 'janux',
    run: (log) => {
      const limit = signal(1);
      const cells = [signal(1), signal(2), signal(3)];

      watch(() => {
        let total = 0;

        for (let i = 0; i < limit.value; i++) total += cells[i]!.value;
        log.push(`total:${total}`);
      });
      log.push(`readers:${cells.map((cell) => cell.readers()).join(',')}`);
      limit.value = 3;
      log.push(`readers:${cells.map((cell) => cell.readers()).join(',')}`);
    },
    expected: ['total:1', 'readers:1,0,0', 'total:6', 'readers:1,1,1'],
  },
  {
    id: 'rx-cg-a-recursive-derived-lookup-tracks-only-the-visited-nodes',
    src: 'janux',
    run: (log) => {
      const nodes = {
        a: signal('b'),
        b: signal('c'),
        c: signal(''),
      };
      const start = signal<'a' | 'b'>('b');

      watch(() => {
        const path: string[] = [];
        let current: string = start.value;

        while (current !== '') {
          path.push(current);
          current = nodes[current as 'a' | 'b' | 'c'].value;
        }
        log.push(`path:${path.join('>')}`);
      });
      log.push(`a-readers:${nodes.a.readers()}`);
      start.value = 'a';
      log.push(`a-readers:${nodes.a.readers()}`);
    },
    expected: ['path:b>c', 'a-readers:0', 'path:a>b>c', 'a-readers:1'],
  },
  {
    id: 'rx-cg-mutually-exclusive-branches-never-both-subscribe',
    src: 'janux',
    run: (log) => {
      const mode = signal<'read' | 'write'>('read');
      const readSource = signal('r');
      const writeSource = signal('w');

      watch(() => {
        log.push(`run:${mode.value === 'read' ? readSource.value : writeSource.value}`);
      });
      log.push(`readers:${readSource.readers()}/${writeSource.readers()}`);
      mode.value = 'write';
      log.push(`readers:${readSource.readers()}/${writeSource.readers()}`);
    },
    expected: ['run:r', 'readers:1/0', 'run:w', 'readers:0/1'],
  },
  {
    id: 'rx-cg-a-fallback-chain-tracks-every-level-it-had-to-consult',
    src: 'janux',
    run: (log) => {
      const primary = signal<string | null>(null);
      const secondary = signal<string | null>(null);
      const fallback = signal('default');

      watch(() => {
        log.push(`run:${primary.value ?? secondary.value ?? fallback.value}`);
      });
      log.push(`readers:${primary.readers()}/${secondary.readers()}/${fallback.readers()}`);
      primary.value = 'p';
      log.push(`readers:${primary.readers()}/${secondary.readers()}/${fallback.readers()}`);
    },
    expected: ['run:default', 'readers:1/1/1', 'run:p', 'readers:1/0/0'],
  },
  {
    id: 'rx-cg-a-computed-condition-cutting-to-the-same-value-keeps-the-branch-stable',
    src: 'janux',
    run: (log) => {
      const raw = signal(1);
      const positive = computed(() => raw.value > 0);
      const shown = signal('x');
      let runs = 0;

      watch(() => {
        runs++;
        if (positive.value) shown.value;
      });
      raw.value = 2;
      raw.value = 3;
      log.push(`runs:${runs}`, `shown-readers:${shown.readers()}`);
    },
    expected: ['runs:1', 'shown-readers:1'],
  },
  {
    id: 'rx-cg-a-branch-that-only-reads-in-the-error-path-subscribes-lazily',
    src: 'janux',
    run: (log) => {
      const failed = signal(false);
      const message = signal('none');

      watch(() => {
        log.push(failed.value ? `error:${message.value}` : 'ok');
      });
      message.value = 'ignored';
      failed.value = true;
      message.value = 'shown';
    },
    expected: ['ok', 'error:ignored', 'error:shown'],
  },
  {
    id: 'rx-cg-a-derived-branch-key-selects-among-many-computeds',
    src: 'janux',
    run: (log) => {
      const raw = signal(5);
      const bucket = computed(() => (raw.value < 10 ? 'low' : 'high'));
      const lowLabel = computed(() => `low:${raw.value}`);
      const highLabel = computed(() => `high:${raw.value}`);

      watch(() => {
        log.push(bucket.value === 'low' ? lowLabel.value : highLabel.value);
      });
      raw.value = 7;
      raw.value = 50;
    },
    expected: ['low:5', 'low:7', 'high:50'],
  },
  {
    id: 'rx-cg-a-branch-reattached-in-the-same-flush-still-sees-later-writes',
    src: 'janux',
    run: (log) => {
      const gate = signal(false);
      const payload = signal('a');

      watch(() => {
        if (gate.value) log.push(`payload:${payload.value}`);
        else log.push('closed');
      });
      watch(() => {
        if (payload.value === 'trigger') gate.value = true;
      });
      payload.value = 'trigger';
      payload.value = 'later';
    },
    expected: ['closed', 'payload:trigger', 'payload:later'],
  },
  {
    id: 'rx-cg-a-ternary-of-two-computeds-only-recomputes-the-selected-one-downstream',
    src: 'janux',
    run: (log) => {
      const useLeft = signal(true);
      const source = signal(1);
      let leftComputes = 0;
      let rightComputes = 0;
      const left = computed(() => {
        leftComputes++;

        return source.value + 1;
      });
      const right = computed(() => {
        rightComputes++;

        return source.value + 2;
      });

      watch(() => { log.push(`run:${useLeft.value ? left.value : right.value}`); });
      source.value = 5;
      log.push(`computes:${leftComputes},${rightComputes}`);
    },
    expected: ['run:2', 'run:6', 'computes:2,2'],
  },
  {
    id: 'rx-cg-a-guard-signal-read-only-in-the-false-branch-detaches-when-true',
    src: 'janux',
    run: (log) => {
      const simple = signal(true);
      const detail = signal('d');

      watch(() => {
        log.push(simple.value ? 'simple' : `detail:${detail.value}`);
      });
      simple.value = false;
      log.push(`readers:${detail.readers()}`);
      simple.value = true;
      log.push(`readers:${detail.readers()}`);
    },
    expected: ['simple', 'detail:d', 'readers:1', 'simple', 'readers:0'],
  },
  {
    id: 'rx-cg-a-count-driven-branch-changes-the-dependency-set-on-every-threshold',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const few = signal('few');
      const many = signal('many');

      watch(() => { log.push(`run:${count.value < 3 ? few.value : many.value}`); });
      count.value = 3;
      few.value = 'ignored';
      many.value = 'lots';
    },
    expected: ['run:few', 'run:many', 'run:lots'],
  },
  {
    id: 'rx-cg-a-branch-inside-a-computed-inside-a-branch-tracks-only-the-live-path',
    src: 'janux',
    run: (log) => {
      const outerGate = signal(true);
      const innerGate = signal(true);
      const leaf = signal('leaf');
      const inner = computed(() => (innerGate.value ? leaf.value : 'closed'));

      watch(() => { log.push(`run:${outerGate.value ? inner.value : 'off'}`); });
      innerGate.value = false;
      log.push(`leaf-readers:${leaf.readers()}`);
      outerGate.value = false;
      leaf.value = 'ignored';
    },
    expected: ['run:leaf', 'run:closed', 'leaf-readers:0', 'run:off'],
  },
];
