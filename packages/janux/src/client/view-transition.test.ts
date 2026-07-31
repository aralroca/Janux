import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { CONFIG_SCRIPT_ID } from '../config';
import { applyWithViewTransition, viewTransitionSettled, viewTransitionsWanted } from './view-transition';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/shop' }));
afterAll(() => GlobalRegistrator.unregister());

/** A `ViewTransition` whose phases the test drives by hand. */
function fakeTransition() {
  const update = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const skipTransition = mock(() => finish.reject(new DOMException('skipped', 'AbortError')));

  return { handle: { updateCallbackDone: update.promise, finished: finish.promise, skipTransition }, update, finish, skipTransition };
}

function installTransitions() {
  const started: ReturnType<typeof fakeTransition>[] = [];

  (document as any).startViewTransition = (callback: () => Promise<void>) => {
    const transition = fakeTransition();

    started.push(transition);
    callback().then(() => transition.update.resolve(), () => transition.update.reject());

    return transition.handle;
  };

  return started;
}

function optIn(viewTransitions: boolean): void {
  const script = document.getElementById(CONFIG_SCRIPT_ID) ?? document.createElement('script');

  script.id = CONFIG_SCRIPT_ID;
  // The type the shell emits — without it the DOM treats the JSON as a script to run.
  script.setAttribute('type', 'application/janux+config');
  script.textContent = JSON.stringify({ navigation: { viewTransitions } });
  document.head.appendChild(script);
}

const reduceMotion = (reduce: boolean) => {
  (window as any).matchMedia = (query: string) => ({ matches: reduce && query.includes('reduce') });
};

beforeEach(() => {
  document.head.innerHTML = '';
  delete (document as any).startViewTransition;
  reduceMotion(false);
});

describe('view transitions around a navigation', () => {
  it('runs the swap plainly when the app never opted in', async () => {
    const started = installTransitions();
    const swap = mock(async () => {});

    optIn(false);
    await applyWithViewTransition(swap);

    expect(swap).toHaveBeenCalledTimes(1);
    expect(started.length).toBe(0);
  });

  /** No config at all is the default, and the default is off. */
  it('runs the swap plainly when there is no navigation config', async () => {
    const started = installTransitions();
    const swap = mock(async () => {});

    await applyWithViewTransition(swap);

    expect(swap).toHaveBeenCalledTimes(1);
    expect(started.length).toBe(0);
  });

  /** The degradation story: an engine without the API still navigates. */
  it('runs the swap plainly when the engine has no startViewTransition', async () => {
    const swap = mock(async () => {});

    optIn(true);
    expect(viewTransitionsWanted()).toBe(false);
    await applyWithViewTransition(swap);

    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('wraps the swap in one transition when the app opted in', async () => {
    const started = installTransitions();
    const swap = mock(async () => {});

    optIn(true);
    expect(viewTransitionsWanted()).toBe(true);
    await applyWithViewTransition(swap);

    expect(started.length).toBe(1);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  /** Not negotiable: asked for less motion means the API is never invoked. */
  it('starts no transition under prefers-reduced-motion: reduce', async () => {
    const started = installTransitions();
    const swap = mock(async () => {});

    optIn(true);
    reduceMotion(true);
    expect(viewTransitionsWanted()).toBe(false);
    await applyWithViewTransition(swap);

    expect(started.length).toBe(0);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  /**
   * The preference is read per navigation, not cached at boot: turning it on
   * mid-session is a request for the animation to stop now.
   */
  it('honours a motion preference that changes mid-session', async () => {
    const started = installTransitions();

    optIn(true);
    await applyWithViewTransition(async () => {});
    reduceMotion(true);
    await applyWithViewTransition(async () => {});

    expect(started.length).toBe(1);
  });
});

describe('a transition that is superseded', () => {
  it('is cut short when the next navigation starts, so no snapshot outlives it', async () => {
    const started = installTransitions();

    optIn(true);
    await applyWithViewTransition(async () => {});
    expect(started[0].skipTransition).not.toHaveBeenCalled();

    await applyWithViewTransition(async () => {});

    expect(started[0].skipTransition).toHaveBeenCalledTimes(1);
    expect(started.length).toBe(2);
  });

  it('is cut short the moment its navigation aborts', async () => {
    const started = installTransitions();
    const controller = new AbortController();

    optIn(true);
    await applyWithViewTransition(async () => {}, controller.signal);
    controller.abort();

    expect(started[0].skipTransition).toHaveBeenCalledTimes(1);
  });

  /** Skipping rejects `finished`; that is a normal outcome, not a navigation failure. */
  it('does not surface the skip as an error', async () => {
    const started = installTransitions();

    optIn(true);
    await applyWithViewTransition(async () => {});
    started[0].skipTransition();

    expect(await viewTransitionSettled().then(() => 'settled')).toBe('settled');
  });
});

describe('waiting for the transition to finish', () => {
  it('resolves immediately when there was no transition', async () => {
    optIn(false);
    await applyWithViewTransition(async () => {});

    expect(await viewTransitionSettled().then(() => 'settled')).toBe('settled');
  });

  /** Route announcement and focus wait on this, so it must not resolve early. */
  it('waits for the animation, not just for the DOM swap', async () => {
    const started = installTransitions();
    let settled = false;

    optIn(true);
    await applyWithViewTransition(async () => {});
    const waiting = viewTransitionSettled().then(() => (settled = true));

    await Bun.sleep(5);
    expect(settled).toBe(false);
    started[0].finish.resolve();
    await waiting;
    expect(settled).toBe(true);
  });
});
