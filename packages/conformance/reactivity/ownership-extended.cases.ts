import { batch, computed, createRoot, getOwner, onCleanup, runWithOwner, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Ownership beyond the core corpus: multi-level cascades, cleanups registered
 * from inside computations (the documented "stable ownership" guarantee),
 * disposed-scope semantics, and what happens when a teardown itself throws or
 * registers more work.
 */
export const OWNERSHIP_EXTENDED_CASES: ScenarioCase[] = [
  {
    id: 'rx-ow-three-level-cascade-disposes-depth-first',
    src: 'solid:signals#nested-root-cascade-order',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('a'));
        createRoot(() => {
          onCleanup(() => log.push('b'));
          createRoot(() => {
            onCleanup(() => log.push('c'));
          });
        });
        dispose();
      });
    },
    expected: ['c', 'b', 'a'],
  },
  {
    id: 'rx-ow-sibling-child-roots-dispose-in-reverse-creation-order',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        createRoot(() => onCleanup(() => log.push('first-child')));
        createRoot(() => onCleanup(() => log.push('second-child')));
        dispose();
      });
    },
    expected: ['second-child', 'first-child'],
  },
  {
    id: 'rx-ow-each-root-has-a-distinct-owner',
    src: 'janux',
    run: (log) => {
      let ownerA: ReturnType<typeof getOwner> = null;

      createRoot(() => {
        ownerA = getOwner();
      });
      createRoot(() => {
        log.push(`distinct:${getOwner() !== ownerA}`);
      });
    },
    expected: ['distinct:true'],
  },
  {
    id: 'rx-ow-nested-run-with-owner-restores-the-full-chain',
    src: 'janux',
    run: (log) => {
      let ownerA: ReturnType<typeof getOwner> = null;

      createRoot(() => {
        ownerA = getOwner();
      });
      createRoot(() => {
        const ownerB = getOwner();

        runWithOwner(ownerA, () => {
          log.push(`inner:${getOwner() === ownerA}`);
          runWithOwner(null, () => {
            log.push(`null:${getOwner() === null}`);
          });
          log.push(`back-to-a:${getOwner() === ownerA}`);
        });
        log.push(`back-to-b:${getOwner() === ownerB}`);
      });
    },
    expected: ['inner:true', 'null:true', 'back-to-a:true', 'back-to-b:true'],
  },
  {
    id: 'rx-ow-oncleanup-on-a-disposed-scope-runs-immediately',
    src: 'janux',
    run: (log) => {
      let owner: ReturnType<typeof getOwner> = null;

      createRoot((dispose) => {
        owner = getOwner();
        dispose();
      });
      runWithOwner(owner, () => onCleanup(() => log.push('immediate')));
      log.push('after');
    },
    expected: ['immediate', 'after'],
  },
  {
    id: 'rx-ow-oncleanup-inside-an-effect-registers-in-the-creation-scope-every-run',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          count.value;
          onCleanup(() => log.push('scope-cleanup'));
        });
        count.value = 1;
        log.push('before-dispose');
        dispose();
      });
    },
    expected: ['before-dispose', 'scope-cleanup', 'scope-cleanup'],
  },
  {
    id: 'rx-ow-oncleanup-inside-a-computed-registers-in-the-creation-scope-every-recompute',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        computed(() => {
          onCleanup(() => log.push('scope-cleanup'));

          return count.value;
        });
        count.value = 1;
        log.push('before-dispose');
        dispose();
      });
    },
    expected: ['before-dispose', 'scope-cleanup', 'scope-cleanup'],
  },
  {
    id: 'rx-ow-effect-reruns-keep-the-creation-owner-not-the-writers',
    src: 'solid:signals#owner-restored-on-rerun',
    run: (log) => {
      const count = signal(0);

      createRoot(() => {
        const rootOwner = getOwner();

        watch(() => {
          count.value;
          log.push(`same:${getOwner() === rootOwner}`);
        });
      });
      count.value = 1;
    },
    expected: ['same:true', 'same:true'],
  },
  {
    id: 'rx-ow-computed-recomputes-keep-the-creation-owner',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot(() => {
        const rootOwner = getOwner();
        const witness = computed(() => {
          count.value;

          return getOwner() === rootOwner;
        });

        watch(() => { log.push(`same:${witness.value}`); });
      });
      count.value = 1;
    },
    expected: ['same:true'],
  },
  {
    id: 'rx-ow-run-with-owner-null-escapes-the-enclosing-root',
    src: 'solid:signals#escape-owner',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        runWithOwner(null, () => {
          watch(() => { log.push(`run:${count.value}`); });
        });
        dispose();
      });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-ow-an-effect-attached-via-run-with-owner-dies-with-that-root',
    src: 'solid:signals#runWithOwner-effect-ownership',
    run: (log) => {
      const count = signal(0);
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      runWithOwner(owner, () => {
        watch(() => { log.push(`run:${count.value}`); });
      });
      count.value = 1;
      dispose();
      count.value = 2;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-ow-a-computed-attached-via-run-with-owner-freezes-with-that-root',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      const double = runWithOwner(owner, () => computed(() => count.value * 2));

      dispose();
      count.value = 10;
      log.push(`frozen:${double.value}`);
    },
    expected: ['frozen:2'],
  },
  {
    id: 'rx-ow-a-throwing-oncleanup-aborts-the-remaining-cleanups',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('registered-first'));
        onCleanup(() => {
          throw new Error('boom');
        });
        onCleanup(() => log.push('registered-third'));
        attempt(log, 'dispose', dispose);
      });
      log.push('after');
    },
    expected: ['registered-third', 'dispose:threw:boom', 'after'],
  },
  {
    id: 'rx-ow-effect-dispose-and-oncleanup-share-one-reverse-ordered-list',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        watch(() => () => log.push('effect-cleanup'));
        onCleanup(() => log.push('on-cleanup'));
        dispose();
      });
    },
    expected: ['on-cleanup', 'effect-cleanup'],
  },
  {
    id: 'rx-ow-root-dispose-during-a-batch-tears-down-immediately-and-skips-queued-runs',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          log.push(`run:${count.value}`);

          return () => log.push('cleanup');
        });
        batch(() => {
          count.value = 1;
          dispose();
          log.push('disposed');
        });
      });
      log.push('flushed');
    },
    expected: ['run:0', 'cleanup', 'disposed', 'flushed'],
  },
  {
    id: 'rx-ow-roots-created-per-effect-rerun-accumulate-under-the-creation-scope',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          const generation = count.value;

          createRoot(() => {
            onCleanup(() => log.push(`generation:${generation}`));
          });
        });
        count.value = 1;
        dispose();
      });
    },
    expected: ['generation:1', 'generation:0'],
  },
  {
    id: 'rx-ow-the-same-cleanup-function-registered-twice-runs-twice',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        const cleanup = () => log.push('cleaned');

        onCleanup(cleanup);
        onCleanup(cleanup);
        dispose();
      });
    },
    expected: ['cleaned', 'cleaned'],
  },
  {
    id: 'rx-ow-oncleanup-registered-during-dispose-inside-the-root-body-runs-immediately',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => {
          onCleanup(() => log.push('late'));
          log.push('outer');
        });
        dispose();
        log.push('after-dispose');
      });
    },
    expected: ['late', 'outer', 'after-dispose'],
  },
  {
    id: 'rx-ow-get-owner-inside-a-cleanup-during-a-top-level-dispose-is-null',
    src: 'janux',
    run: (log) => {
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        onCleanup(() => log.push(`owner:${String(getOwner())}`));
      });
      dispose();
    },
    expected: ['owner:null'],
  },
  {
    id: 'rx-ow-a-throw-in-the-root-body-propagates-and-restores-the-owner',
    src: 'janux',
    run: (log) => {
      attempt(log, 'create', () =>
        createRoot(() => {
          onCleanup(() => log.push('never'));
          throw new Error('boom');
        }),
      );
      log.push(`owner:${String(getOwner())}`);
    },
    expected: ['create:threw:boom', 'owner:null'],
  },
  {
    id: 'rx-ow-the-docs-stop-pattern-dispose-escapes-as-the-return-value',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const stop = createRoot((dispose) => {
        watch(() => { log.push(`run:${count.value}`); });

        return dispose;
      });

      count.value = 1;
      stop();
      count.value = 2;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-ow-two-effects-in-one-root-both-die-with-it',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => { log.push(`first:${count.value}`); });
        watch(() => { log.push(`second:${count.value}`); });
        dispose();
      });
      count.value = 1;
      log.push('silent');
    },
    expected: ['first:0', 'second:0', 'silent'],
  },
  {
    id: 'rx-ow-manually-disposing-an-owned-effect-before-the-root-is-safe',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        const disposeEffect = watch(() => {
          count.value;

          return () => log.push('cleanup');
        });

        disposeEffect();
        log.push('effect-gone');
        attempt(log, 'root', dispose);
      });
    },
    expected: ['cleanup', 'effect-gone', 'root:ok'],
  },
  {
    id: 'rx-ow-write-inside-oncleanup-notifies-live-effects',
    src: 'janux',
    run: (log) => {
      const status = signal('mounted');

      watch(() => { log.push(`status:${status.value}`); });
      createRoot((dispose) => {
        onCleanup(() => {
          status.value = 'unmounted';
        });
        dispose();
      });
    },
    expected: ['status:mounted', 'status:unmounted'],
  },
  {
    id: 'rx-ow-parent-dispose-after-child-manual-dispose-does-not-double-clean',
    src: 'janux',
    run: (log) => {
      createRoot((disposeOuter) => {
        createRoot((disposeInner) => {
          onCleanup(() => log.push('inner'));
          disposeInner();
        });
        disposeOuter();
      });
      log.push('done');
    },
    expected: ['inner', 'done'],
  },
  {
    id: 'rx-ow-run-with-owner-attaches-work-across-two-live-roots',
    src: 'janux',
    run: (log) => {
      let ownerA: ReturnType<typeof getOwner> = null;
      let disposeA = () => {};

      createRoot((dispose) => {
        ownerA = getOwner();
        disposeA = dispose;
      });
      createRoot((disposeB) => {
        runWithOwner(ownerA, () => onCleanup(() => log.push('a-owned')));
        disposeB();
        log.push('b-disposed');
      });
      disposeA();
      log.push('a-disposed');
    },
    expected: ['b-disposed', 'a-owned', 'a-disposed'],
  },
  {
    id: 'rx-ow-getowner-in-an-inner-effect-is-the-root-not-the-outer-effect',
    src: 'janux',
    run: (log) => {
      createRoot(() => {
        const rootOwner = getOwner();

        watch(() => {
          watch(() => {
            log.push(`inner-sees-root:${getOwner() === rootOwner}`);
          });
        });
      });
    },
    expected: ['inner-sees-root:true'],
  },
  {
    id: 'rx-ow-a-disposed-root-can-be-followed-by-a-fresh-root-with-the-same-body',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const body = (dispose: () => void) => {
        watch(() => { log.push(`run:${count.value}`); });

        return dispose;
      };
      const stopFirst = createRoot(body);

      stopFirst();
      createRoot(body);
      count.value = 1;
    },
    expected: ['run:0', 'run:0', 'run:1'],
  },
  {
    id: 'rx-ow-get-owner-is-unchanged-inside-a-batch',
    src: 'janux',
    run: (log) => {
      createRoot(() => {
        const before = getOwner();

        batch(() => {
          log.push(`same:${getOwner() === before}`);
        });
      });
    },
    expected: ['same:true'],
  },
  {
    id: 'rx-ow-roots-created-inside-a-computed-cascade-from-the-computeds-scope',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        computed(() => {
          const generation = count.value;

          createRoot(() => {
            onCleanup(() => log.push(`generation:${generation}`));
          });

          return generation;
        });
        count.value = 1;
        dispose();
      });
    },
    expected: ['generation:1', 'generation:0'],
  },
  {
    id: 'rx-ow-a-root-whose-dispose-is-never-called-keeps-its-effects-live',
    src: 'solid:signals#unused-dispose-stays-live',
    run: (log) => {
      const count = signal(0);

      createRoot(() => {
        watch(() => { log.push(`run:${count.value}`); });
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['run:0', 'run:1', 'run:2'],
  },
  {
    id: 'rx-ow-a-sibling-roots-cleanup-can-dispose-another-root',
    src: 'vue:effectScope#cleanup-stops-sibling-scope',
    run: (log) => {
      const count = signal(0);
      let disposeSecond = () => {};

      createRoot((dispose) => {
        disposeSecond = dispose;
        watch(() => { log.push(`run:${count.value}`); });
      });
      createRoot((disposeFirst) => {
        onCleanup(() => disposeSecond());
        disposeFirst();
      });
      count.value = 1;
      log.push('silent');
    },
    expected: ['run:0', 'silent'],
  },
];
