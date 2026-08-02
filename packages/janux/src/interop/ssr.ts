import { detachProps } from './detach';
import type { ForeignDef } from './index';

/**
 * Server-rendering a foreign island — and, above all, telling the two ways it
 * can produce nothing apart.
 *
 * React is an optional peer: an app that never installs it still builds, and a
 * foreign island then ships an empty host that the client never hydrates. That
 * is *absent*, and it is documented.
 *
 * A component that throws while rendering is *replaced*: the host is byte-for-byte
 * the same empty element, so a chart that crashed and a chart the runtime cannot
 * find look identical in the HTML. Swallowing that was the framework breaking its
 * own rule — silently replaced is worse than absent — and it hid the single most
 * common interop mistake there is: a file compiled with Janux's JSX runtime hands
 * React a Janux node, React refuses it, and the island renders blank forever with
 * nothing in the log. Everything except a missing runtime is therefore raised,
 * named, and (where React's own complaint identifies it) explained.
 */

export type ForeignImport = (spec: string) => Promise<any>;

/** CJS/ESM interop for a dynamically imported module. */
function interopDefault(mod: any): any {
  return mod?.default ?? mod;
}

/**
 * Node, Bun and Vite all word "this package is not installed" differently, and
 * only that case may stay quiet — so the match is on the resolution failure
 * itself, never on a substring of the app's own error.
 */
function isRuntimeAbsent(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;

  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;

  return /Cannot find (package|module) ['"]react/.test(String((error as Error)?.message ?? error));
}

/**
 * React's own words for a Janux node reaching it: it prints the keys of the
 * object it refused, and `$t`/`$p` are this framework's node shape and nobody
 * else's. That makes the diagnosis certain rather than a guess.
 */
const JANUX_NODE_REFUSED = /not valid as a React child[^]*\$t/;

function hint(message: string): string {
  if (JANUX_NODE_REFUSED.test(message)) {
    return ' — it returned a Janux node, not a React element: add `/** @jsxImportSource react */` at the top of the file that defines it (or set `jsxImportSource` for it in tsconfig)';
  }

  return '';
}

/** The error a caller sees instead of an empty host that explains nothing. */
export function foreignRenderError(def: ForeignDef, error: unknown): Error {
  const message = String((error as Error)?.message ?? error);

  return new Error(
    `Janux: foreign <${def.name}> failed to server-render${hint(message)}. ${message.replace(/\.$/, '')}. Set \`hydrate: 'only'\` to skip SSR for this island.`,
  );
}

/**
 * SSR markup for a foreign component. Empty when SSR is skipped (`hydrate:
 * 'only'`) or the runtime is not installed; anything else throws — the enclosing
 * island turns it into its fail-soft marker, exactly as a Janux component's own
 * throw is treated.
 */
export async function renderForeignToString(
  def: ForeignDef,
  props: Record<string, unknown>,
  load: ForeignImport,
): Promise<string> {
  if (def.options.hydrate === 'only') return '';
  let react: any;
  let reactServer: any;

  try {
    [react, reactServer] = await Promise.all([load('react'), load('react-dom/server')]);
  } catch (error) {
    if (isRuntimeAbsent(error)) return '';
    throw foreignRenderError(def, error);
  }

  try {
    const mapped = def.options.props ? def.options.props(props) : props;
    // The same props boundary as on the client — see interop/detach.
    const element = interopDefault(react).createElement(def.component as any, detachProps(mapped) as any);

    return interopDefault(reactServer).renderToString(element);
  } catch (error) {
    throw foreignRenderError(def, error);
  }
}
