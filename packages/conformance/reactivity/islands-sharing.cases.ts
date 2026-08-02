import { batch, computed, createRoot, onCleanup, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Several disposal scopes sharing one store, the way independent islands share
 * app state. What must hold: one island's teardown never disturbs another's
 * subscriptions, and a cross-island write reaches every live scope exactly
 * once per flush.
 */
export const ISLAND_SHARING_CASES: ScenarioCase[] = [
  {
    id: 'rx-is-a-shared-store-write-reaches-every-live-island-once',
    src: 'janux',
    run: (log) => {
      const store = signal(0);

      ['a', 'b', 'c'].forEach((island) => {
        createRoot(() => {
          watch(() => { log.push(`${island}:${store.value}`); });
        });
      });
      store.value = 1;
    },
    expected: ['a:0', 'b:0', 'c:0', 'a:1', 'b:1', 'c:1'],
  },
  {
    id: 'rx-is-one-island-writing-the-store-notifies-the-others-in-the-same-flush',
    src: 'janux',
    run: (log) => {
      const store = signal(0);
      const trigger = signal(0);

      createRoot(() => {
        watch(() => {
          if (trigger.value === 1) store.value = 5;
        });
      });
      createRoot(() => {
        watch(() => { log.push(`reader:${store.value}`); });
      });
      trigger.value = 1;
      log.push('flushed');
    },
    expected: ['reader:0', 'reader:5', 'flushed'],
  },
  {
    id: 'rx-is-unmounting-one-island-leaves-the-rest-subscribed',
    src: 'janux',
    run: (log) => {
      const store = signal(0);
      let unmount = () => {};

      createRoot((dispose) => {
        unmount = dispose;
        watch(() => { log.push(`transient:${store.value}`); });
      });
      createRoot(() => {
        watch(() => { log.push(`persistent:${store.value}`); });
      });
      unmount();
      store.value = 1;
      log.push(`readers:${store.readers()}`);
    },
    expected: ['transient:0', 'persistent:0', 'persistent:1', 'readers:1'],
  },
  {
    id: 'rx-is-a-derived-view-shared-by-two-islands-computes-once',
    src: 'janux',
    run: (log) => {
      const store = signal(1);
      let computes = 0;
      const view = computed(() => {
        computes++;

        return store.value * 2;
      });

      createRoot(() => watch(() => { log.push(`a:${view.value}`); }));
      createRoot(() => watch(() => { log.push(`b:${view.value}`); }));
      store.value = 2;
      log.push(`computes:${computes}`);
    },
    expected: ['a:2', 'b:2', 'a:4', 'b:4', 'computes:2'],
  },
  {
    id: 'rx-is-an-island-owning-the-derived-view-freezes-it-for-everyone-on-unmount',
    src: 'janux',
    run: (log) => {
      const store = signal(1);
      let unmountOwner = () => {};
      const view = createRoot((dispose) => {
        unmountOwner = dispose;

        return computed(() => store.value * 2);
      });

      createRoot(() => watch(() => { log.push(`consumer:${view.value}`); }));
      store.value = 2;
      unmountOwner();
      store.value = 3;
      log.push(`frozen:${view.value}`);
    },
    expected: ['consumer:2', 'consumer:4', 'frozen:4'],
  },
  {
    id: 'rx-is-a-batched-store-update-renders-every-island-once',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const second = signal(0);

      ['a', 'b'].forEach((island) => {
        createRoot(() => {
          watch(() => { log.push(`${island}:${first.value}${second.value}`); });
        });
      });
      batch(() => {
        first.value = 1;
        second.value = 2;
      });
    },
    expected: ['a:00', 'b:00', 'a:12', 'b:12'],
  },
  {
    id: 'rx-is-remounting-an-island-resubscribes-and-sees-the-current-store',
    src: 'janux',
    run: (log) => {
      const store = signal(0);
      const mount = () =>
        createRoot((dispose) => {
          watch(() => { log.push(`island:${store.value}`); });

          return dispose;
        });
      const unmount = mount();

      unmount();
      store.value = 7;
      mount();
      store.value = 8;
    },
    expected: ['island:0', 'island:7', 'island:8'],
  },
  {
    id: 'rx-is-an-islands-cleanup-writing-the-store-notifies-the-remaining-islands',
    src: 'janux',
    run: (log) => {
      const activeCount = signal(2);

      createRoot(() => {
        watch(() => { log.push(`observer:${activeCount.value}`); });
      });
      createRoot((dispose) => {
        onCleanup(() => {
          activeCount.value = activeCount.peek() - 1;
        });
        dispose();
      });
    },
    expected: ['observer:2', 'observer:1'],
  },
  {
    // Both writes are queued behind the still-running flush, so the observer
    // island renders once with both of them applied — not once per writer.
    id: 'rx-is-two-islands-writing-in-the-same-flush-coalesce-into-one-render',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const left = signal('');
      const right = signal('');

      createRoot(() => {
        watch(() => {
          if (trigger.value === 1) left.value = 'L';
        });
      });
      createRoot(() => {
        watch(() => {
          if (trigger.value === 1) right.value = 'R';
        });
      });
      createRoot(() => {
        watch(() => { log.push(`view:${left.value}${right.value}`); });
      });
      trigger.value = 1;
    },
    expected: ['view:', 'view:LR'],
  },
  {
    id: 'rx-is-nested-islands-share-the-store-and-unmount-together',
    src: 'janux',
    run: (log) => {
      const store = signal(0);

      createRoot((dispose) => {
        watch(() => { log.push(`parent:${store.value}`); });
        createRoot(() => {
          watch(() => { log.push(`child:${store.value}`); });
        });
        store.value = 1;
        dispose();
      });
      store.value = 2;
      log.push(`readers:${store.readers()}`);
    },
    expected: ['parent:0', 'child:0', 'parent:1', 'child:1', 'readers:0'],
  },
];
