import { signal, effect as watch, untrack, type Sig } from '../signals';
import type { ForeignDef, HydrateDirective } from '../interop';
import type { JanuxInstance } from '../runtime/instance';

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

/** Foreign callbacks become calls into the enclosing island's intents (events → intents bridge). */
function intentBindings(def: ForeignDef, parent?: JanuxInstance): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(def.options.on ?? {}).map(([prop, intentName]) => [
      prop,
      (...args: unknown[]) => parent?.intents[intentName]?.(args[0]),
    ]),
  );
}

function reportError(error: unknown): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
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
  const bindings = intentBindings(def, parent);
  let disposed = false;
  let reactRoot: ReactRoot | undefined;
  let stopRender: (() => void) | undefined;

  const start = async () => {
    const [{ createElement }, client] = await Promise.all([import('react'), import('react-dom/client')]);

    if (disposed || !host.isConnected) return;
    const element = () => {
      const own = props.value;
      const mapped = def.options.props ? def.options.props(own) : own;

      return createElement(def.component as any, { ...mapped, ...bindings } as any);
    };

    // Deterministic render-replace over the SSR markup: state may have moved
    // since SSR (interactions land before lazy hydration), so hydrateRoot
    // would race into mismatches. The SSR markup serves paint-before-JS.
    host.replaceChildren();
    reactRoot = client.createRoot(host as any) as ReactRoot;
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
      reactRoot?.unmount();
    },
  };
}
