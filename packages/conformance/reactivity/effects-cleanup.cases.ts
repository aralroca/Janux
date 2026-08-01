import { batch, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The returned-cleanup contract: runs before the next body and on dispose,
 * captures the values of its own run, is installed fresh per run — and runs at
 * MOST once, even when it throws or when the effect dies while it is pending.
 */
export const EFFECT_CLEANUP_CASES: ScenarioCase[] = [
  {
    id: 'rx-cl-no-cleanup-runs-before-the-first-body',
    src: 'solid:signals#no-cleanup-on-first-run',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`body:${count.value}`);

        return () => log.push('cleanup');
      });
    },
    expected: ['body:0'],
  },
  {
    id: 'rx-cl-cleanup-captures-the-values-of-its-own-run',
    src: 'preact:signals#cleanup-closure-capture',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        const seen = count.value;

        return () => log.push(`cleanup:${seen}`);
      });

      count.value = 1;
      count.value = 2;
      dispose();
    },
    expected: ['cleanup:0', 'cleanup:1', 'cleanup:2'],
  },
  {
    id: 'rx-cl-a-silent-write-triggers-no-cleanup',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      watch(() => {
        count.value;

        return () => log.push('cleanup');
      });
      count.value = 1;
      log.push('done');
    },
    expected: ['done'],
  },
  {
    id: 'rx-cl-one-batched-rerun-means-one-cleanup',
    src: 'preact:signals#batch-single-cleanup',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => {
        a.value;
        b.value;

        return () => log.push('cleanup');
      });
      batch(() => {
        a.value = 1;
        b.value = 1;
      });
    },
    expected: ['cleanup'],
  },
  {
    id: 'rx-cl-cleanup-runs-before-the-next-body-not-after-the-previous',
    src: 'solid:signals#cleanup-body-interleave',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`body:${count.value}`);

        return () => log.push(`cleanup-before:${count.peek()}`);
      });
      log.push('idle');
      count.value = 1;
    },
    expected: ['body:0', 'idle', 'cleanup-before:1', 'body:1'],
  },
  {
    id: 'rx-cl-a-conditional-cleanup-is-only-called-when-it-was-returned',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        const seen = count.value;

        if (seen % 2 === 0) return () => log.push(`cleanup:${seen}`);
      });
      count.value = 1;
      count.value = 2;
      count.value = 3;
    },
    expected: ['cleanup:0', 'cleanup:2'],
  },
  {
    id: 'rx-cl-a-throwing-cleanup-propagates-to-the-writer',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;

        return () => {
          throw new Error('cleanup-boom');
        };
      });
      attempt(log, 'write', () => (count.value = 1));
    },
    expected: ['write:threw:cleanup-boom'],
  },
  {
    id: 'rx-cl-a-throwing-cleanup-never-runs-twice',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let poisoned = false;

      watch(() => {
        log.push(`body:${count.value}`);

        if (!poisoned) {
          poisoned = true;

          return () => {
            throw new Error('cleanup-boom');
          };
        }
      });
      attempt(log, 'first', () => (count.value = 1));
      attempt(log, 'second', () => (count.value = 2));
    },
    expected: ['body:0', 'first:threw:cleanup-boom', 'body:2', 'second:ok'],
  },
  {
    id: 'rx-cl-a-cleanup-that-throws-on-dispose-still-completes-the-disposal',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;

        return () => {
          throw new Error('boom');
        };
      });

      attempt(log, 'dispose', dispose);
      log.push(`readers:${count.readers()}`);
      count.value = 1;
      log.push('silent');
    },
    expected: ['dispose:threw:boom', 'readers:0', 'silent'],
  },
  {
    id: 'rx-cl-each-run-installs-a-fresh-cleanup-replacing-the-old',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        const seen = count.value;

        return () => log.push(`cleanup:${seen}`);
      });

      count.value = 1;
      dispose();
      dispose();
    },
    expected: ['cleanup:0', 'cleanup:1'],
  },
  {
    id: 'rx-cl-cleanup-writes-propagate-to-other-effects',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const mirror = signal(0);

      watch(() => { log.push(`mirror:${mirror.value}`); });
      watch(() => {
        trigger.value;

        return () => { mirror.value = mirror.peek() + 1; };
      });
      trigger.value = 1;
      log.push('done');
    },
    expected: ['mirror:0', 'mirror:1', 'done'],
  },
  {
    id: 'rx-cl-dispose-inside-a-batch-runs-the-cleanup-immediately',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;

        return () => log.push('cleanup');
      });

      batch(() => {
        count.value = 1;
        log.push('pre');
        dispose();
        log.push('post');
      });
    },
    expected: ['pre', 'cleanup', 'post'],
  },
  {
    id: 'rx-cl-disposing-mid-batch-skips-both-rerun-and-its-cleanup',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        log.push(`body:${count.value}`);

        return () => log.push(`cleanup:${count.peek()}`);
      });

      batch(() => {
        count.value = 1;
        dispose();
      });
      log.push('flushed');
    },
    expected: ['body:0', 'cleanup:1', 'flushed'],
  },
  {
    id: 'rx-cl-cleanup-of-a-dependency-flip-runs-even-though-the-old-branch-is-gone',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const inner = signal(0);

      watch(() => {
        const label = gate.value ? `on:${inner.value}` : 'off';

        return () => log.push(`cleanup:${label}`);
      });
      gate.value = false;
      inner.value = 1;
      log.push('done');
    },
    expected: ['cleanup:on:0', 'done'],
  },
  {
    id: 'rx-cl-cleanups-of-two-effects-on-one-write-interleave-per-effect',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`body-a:${count.value}`);

        return () => log.push('cleanup-a');
      });
      watch(() => {
        log.push(`body-b:${count.value}`);

        return () => log.push('cleanup-b');
      });
      count.value = 1;
    },
    expected: ['body-a:0', 'body-b:0', 'cleanup-a', 'body-a:1', 'cleanup-b', 'body-b:1'],
  },
  {
    // The cleanup runs before the body, so its write is visible to the very
    // run it precedes — the body never observes the intermediate value, and
    // the re-queued run fires once more with the (unchanged) final value.
    id: 'rx-cl-a-cleanup-writing-its-own-effects-dependency-converges',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`body:${count.value}`);

        return () => {
          if (count.peek() === 1) count.value = 2;
        };
      });
      count.value = 1;
    },
    expected: ['body:0', 'body:2', 'body:2'],
  },
  {
    id: 'rx-cl-zero-arg-arrow-with-block-body-returns-undefined-no-cleanup-call',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;
        log.push('body');
      });

      count.value = 1;
      attempt(log, 'dispose', dispose);
    },
    expected: ['body', 'body', 'dispose:ok'],
  },
  {
    id: 'rx-cl-cleanup-count-equals-rerun-count-plus-dispose',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let cleanups = 0;
      const dispose = watch(() => {
        count.value;

        return () => cleanups++;
      });

      count.value = 1;
      count.value = 2;
      count.value = 3;
      dispose();
      log.push(`cleanups:${cleanups}`);
    },
    expected: ['cleanups:4'],
  },
  {
    id: 'rx-cl-dispose-after-a-run-that-returned-no-cleanup-calls-nothing',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        if (count.value === 0) return () => log.push('cleanup');
      });

      count.value = 1;
      dispose();
      log.push('disposed');
    },
    expected: ['cleanup', 'disposed'],
  },
  {
    id: 'rx-cl-two-instances-of-one-callback-keep-separate-cleanups',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let generation = 0;
      const body = () => {
        count.value;
        const mine = ++generation;

        return () => log.push(`cleanup:${mine}`);
      };
      const first = watch(body);
      const second = watch(body);

      first();
      second();
    },
    expected: ['cleanup:1', 'cleanup:2'],
  },
  {
    id: 'rx-cl-writes-after-dispose-trigger-no-late-cleanup',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;

        return () => log.push('cleanup');
      });

      dispose();
      count.value = 1;
      count.value = 2;
      log.push('done');
    },
    expected: ['cleanup', 'done'],
  },
];
