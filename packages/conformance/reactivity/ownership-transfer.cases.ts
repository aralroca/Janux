import { computed, createRoot, getOwner, onCleanup, runWithOwner, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Moving work between scopes with `getOwner`/`runWithOwner`. The failure this
 * pair exists to prevent is work that outlives its island; the failure it can
 * CAUSE is work attached to the wrong island — so every case here pins where
 * the registration actually landed.
 */
export const OWNERSHIP_TRANSFER_CASES: ScenarioCase[] = [
  {
    id: 'rx-ot-a-captured-owner-outlives-the-root-body',
    src: 'janux',
    run: (log) => {
      let owner: ReturnType<typeof getOwner> = null;

      createRoot(() => {
        owner = getOwner();
      });
      log.push(`captured:${owner !== null}`, `current:${getOwner() === null}`);
    },
    expected: ['captured:true', 'current:true'],
  },
  {
    id: 'rx-ot-work-transferred-into-a-scope-is-disposed-with-it',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      runWithOwner(owner, () => {
        computed(() => count.value * 2);
        watch(() => {
          count.value;
        });
      });
      log.push(`live:${count.readers()}`);
      dispose();
      log.push(`after:${count.readers()}`);
    },
    expected: ['live:2', 'after:0'],
  },
  {
    id: 'rx-ot-transferring-into-a-sibling-scope-does-not-affect-the-current-one',
    src: 'janux',
    run: (log) => {
      let target: ReturnType<typeof getOwner> = null;
      let disposeTarget = () => {};

      createRoot((dispose) => {
        target = getOwner();
        disposeTarget = dispose;
      });
      createRoot((disposeHost) => {
        runWithOwner(target, () => onCleanup(() => log.push('to-target')));
        onCleanup(() => log.push('to-host'));
        disposeHost();
        log.push('host-gone');
      });
      disposeTarget();
    },
    expected: ['to-host', 'host-gone', 'to-target'],
  },
  {
    id: 'rx-ot-run-with-owner-nests-and-unwinds-correctly-three-deep',
    src: 'janux',
    run: (log) => {
      const owners: ReturnType<typeof getOwner>[] = [];

      for (let i = 0; i < 3; i++) {
        createRoot(() => {
          owners.push(getOwner());
        });
      }
      runWithOwner(owners[0]!, () => {
        runWithOwner(owners[1]!, () => {
          runWithOwner(owners[2]!, () => {
            log.push(`depth-3:${getOwner() === owners[2]}`);
          });
          log.push(`depth-2:${getOwner() === owners[1]}`);
        });
        log.push(`depth-1:${getOwner() === owners[0]}`);
      });
      log.push(`unwound:${getOwner() === null}`);
    },
    expected: ['depth-3:true', 'depth-2:true', 'depth-1:true', 'unwound:true'],
  },
  {
    id: 'rx-ot-an-effect-transferred-into-a-scope-keeps-that-owner-on-reruns',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let owner: ReturnType<typeof getOwner> = null;

      createRoot(() => {
        owner = getOwner();
      });
      runWithOwner(owner, () => {
        watch(() => {
          count.value;
          log.push(`owner-matches:${getOwner() === owner}`);
        });
      });
      count.value = 1;
    },
    expected: ['owner-matches:true', 'owner-matches:true'],
  },
  {
    id: 'rx-ot-transferring-into-a-disposed-scope-runs-cleanups-immediately',
    src: 'janux',
    run: (log) => {
      let owner: ReturnType<typeof getOwner> = null;

      createRoot((dispose) => {
        owner = getOwner();
        dispose();
      });
      runWithOwner(owner, () => {
        onCleanup(() => log.push('immediate-a'));
        onCleanup(() => log.push('immediate-b'));
      });
      log.push('done');
    },
    expected: ['immediate-a', 'immediate-b', 'done'],
  },
  {
    id: 'rx-ot-run-with-owner-null-inside-a-transfer-detaches-only-that-block',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      runWithOwner(owner, () => {
        watch(() => { log.push(`owned:${count.value}`); });
        runWithOwner(null, () => {
          watch(() => { log.push(`free:${count.value}`); });
        });
      });
      dispose();
      count.value = 1;
    },
    expected: ['owned:0', 'free:0', 'free:1'],
  },
  {
    id: 'rx-ot-the-owner-inside-an-effect-body-can-be-captured-and-reused',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let captured: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        watch(() => {
          count.value;
          captured = getOwner();
        });
      });
      runWithOwner(captured, () => onCleanup(() => log.push('reattached')));
      dispose();
    },
    expected: ['reattached'],
  },
  {
    id: 'rx-ot-a-transfer-inside-a-cleanup-registers-in-the-target-not-the-dying-scope',
    src: 'janux',
    run: (log) => {
      let target: ReturnType<typeof getOwner> = null;
      let disposeTarget = () => {};

      createRoot((dispose) => {
        target = getOwner();
        disposeTarget = dispose;
      });
      createRoot((disposeSource) => {
        onCleanup(() => {
          runWithOwner(target, () => onCleanup(() => log.push('moved')));
        });
        disposeSource();
        log.push('source-gone');
      });
      disposeTarget();
      log.push('target-gone');
    },
    expected: ['source-gone', 'moved', 'target-gone'],
  },
  {
    id: 'rx-ot-run-with-owner-propagates-the-callback-error-after-restoring',
    src: 'janux',
    run: (log) => {
      let owner: ReturnType<typeof getOwner> = null;

      createRoot(() => {
        owner = getOwner();
      });
      attempt(log, 'transfer', () =>
        runWithOwner(owner, () => {
          throw new Error('boom');
        }),
      );
      log.push(`restored:${getOwner() === null}`);
    },
    expected: ['transfer:threw:boom', 'restored:true'],
  },
  {
    id: 'rx-ot-a-computed-transferred-into-a-scope-freezes-on-that-scopes-dispose',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      const doubled = runWithOwner(owner, () => computed(() => count.value * 2));

      count.value = 3;
      log.push(`live:${doubled.value}`);
      dispose();
      count.value = 5;
      log.push(`frozen:${doubled.value}`);
    },
    expected: ['live:6', 'frozen:6'],
  },
  {
    id: 'rx-ot-transferring-into-the-same-owner-twice-registers-both-cleanups',
    src: 'janux',
    run: (log) => {
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      runWithOwner(owner, () => onCleanup(() => log.push('first')));
      runWithOwner(owner, () => onCleanup(() => log.push('second')));
      dispose();
    },
    expected: ['second', 'first'],
  },
];
