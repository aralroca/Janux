import { signal, effect as watch, untrack, type Sig } from '../signals';
import type { ForeignDef, HydrateDirective } from '../interop';
import type { JanuxInstance } from '../runtime/instance';
import { KEEP_ATTRIBUTE } from './navigate';
import { isPlainContainer, plainify } from '../state/plainify';

/** A live foreign (React) root bound to a host element. */
export interface ForeignHandle {
  props: Sig<Record<string, unknown>>;
  dispose(): void;
}

interface ReactRoot {
  render(node: unknown): void;
  unmount(): void;
}

function scheduleHydrate(host: Element, directive: HydrateDirective, run: () => void): void {
  if (directive === 'idle') {
    const idle = (globalThis as any).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1));

    idle(run);

    return;
  }
  if (directive === 'visible') {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    });

    observer.observe(host);

    return;
  }
  run();
}

/**
 * Foreign callbacks become calls into the enclosing island's intents (events →
 * intents bridge). Without an `input` mapper the first argument IS the payload;
 * with one, the mapper sees every argument and the live call-site props — which
 * is what makes an updater-function callback resolvable at all, since resolving
 * it needs the previous value and that lives in the island.
 */
function intentBindings(
  def: ForeignDef,
  props: Sig<Record<string, unknown>>,
  parent?: JanuxInstance,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(def.options.on ?? {}).map(([prop, binding]) => {
      const { intent, input } = typeof binding === 'string' ? { intent: binding, input: undefined } : binding;

      return [
        prop,
        (...args: unknown[]) =>
          parent?.intents[intent]?.(input ? input({ args, own: untrack(() => props.value) }) : args[0]),
      ];
    }),
  );
}

/**
 * Plain data cached by the proxy that produced it. State proxies are stable per
 * (path, version), so an unchanged subtree hands back the very same plain object
 * — structural sharing across the boundary: React keeps its memoization, and a
 * 10 000-row list is not re-cloned because a filter string changed.
 */
const detached = new WeakMap<object, unknown>();

/**
 * React gets plain data, never the live state proxy. Two reasons, both real:
 * a library that deep-freezes its props (Immer — and so Redux Toolkit, and so
 * Recharts 3) would otherwise freeze the proxy's TARGET, leaving island state
 * permanently unwritable and every later read throwing a Proxy invariant error;
 * and a foreign component could otherwise mutate island state directly, behind
 * the intents that are supposed to be the only way in.
 */
function detach(value: unknown): unknown {
  if (!isPlainContainer(value)) return value;
  const cached = detached.get(value);

  if (cached !== undefined) return cached;
  const plain = plainify(value);

  detached.set(value, plain);

  return plain;
}

function reportError(error: unknown): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
}

/**
 * React tags every host node it creates with an internal fiber key, and it does
 * so before inserting it — so at mutation time this tells a React-owned node
 * from one the morph, the app or another library put there. Narrow on purpose:
 * tagging every body insertion would make an app's own nodes survive
 * navigations they should not.
 */
const REACT_KEY = /^__react(Fiber|Container)\$/;

function reactOwned(node: Element): boolean {
  return Object.keys(node).some((key) => REACT_KEY.test(key));
}

/**
 * A11y primitives (Radix, base-ui) portal their popups into `<body>` — OUTSIDE
 * the `<janux-foreign>` host the morph treats as an opaque leaf. Left alone, a
 * navigation removes nodes this root still owns and React throws
 * `removeChild: not a child of this node` on unmount, aborting the teardown
 * midway: every effect cleanup after the portal is skipped, so a dialog's
 * scroll-lock never releases and `<body>` stays unscrollable on the next page.
 *
 * A React-owned node added directly to `<body>` is runtime-injected, which is
 * exactly what `data-janux-keep` marks: it belongs to the session, not to the
 * route. The morph then leaves it alone, React unmounts cleanly, and its own
 * teardown removes it.
 */
function keepPortalsAcrossNavigation(): () => void {
  const observer = new MutationObserver((records) =>
    records.forEach(({ addedNodes }) =>
      addedNodes.forEach((node) => {
        if (node instanceof Element && reactOwned(node)) node.setAttribute(KEEP_ATTRIBUTE, '');
      }),
    ),
  );

  observer.observe(document.body, { childList: true });

  return () => observer.disconnect();
}

/**
 * Mounts one foreign island: a real embedded React root, hydrated from SSR
 * markup when present, re-rendered through a tracked props bridge — signal
 * reads inside `options.props` re-render only this root.
 */
export function mountForeign(
  def: ForeignDef,
  host: Element,
  initialProps: Record<string, unknown>,
  parent?: JanuxInstance,
): ForeignHandle {
  const props = signal(initialProps);
  const bindings = intentBindings(def, props, parent);
  let disposed = false;
  let reactRoot: ReactRoot | undefined;
  let stopRender: (() => void) | undefined;
  let stopKeepingPortals: (() => void) | undefined;

  const start = async () => {
    const [{ createElement }, client] = await Promise.all([import('react'), import('react-dom/client')]);

    if (disposed || !host.isConnected) return;
    const element = () => {
      const own = props.value;
      const mapped = def.options.props ? def.options.props(own) : own;
      const plain = Object.fromEntries(Object.entries(mapped).map(([key, value]) => [key, detach(value)]));

      return createElement(def.component as any, { ...plain, ...bindings } as any);
    };

    // Deterministic render-replace over the SSR markup: state may have moved
    // since SSR (interactions land before lazy hydration), so hydrateRoot
    // would race into mismatches. The SSR markup serves paint-before-JS.
    host.replaceChildren();
    reactRoot = client.createRoot(host as any) as ReactRoot;
    stopKeepingPortals = keepPortalsAcrossNavigation();
    stopRender = watch(() => reactRoot!.render(element()));
  };

  scheduleHydrate(host, def.options.hydrate, () => {
    start().catch(reportError);
  });

  return {
    props,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopRender?.();
      stopKeepingPortals?.();
      reactRoot?.unmount();
    },
  };
}
