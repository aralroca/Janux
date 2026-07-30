/**
 * The contract between Janux and a deployment target.
 *
 * There are exactly two halves, and they meet nowhere else:
 *
 * - **at build time**, an adapter's `adapt(builder)` turns what `janux build`
 *   emitted into whatever the platform wants to be handed;
 * - **at runtime**, whatever it emitted answers `Request → Response`, which is
 *   what `createRequestHandler` produces and what every target already speaks —
 *   Bun (`Bun.serve`), Deno (`Deno.serve`), Cloudflare and Netlify (`export
 *   default { fetch }`). Node is the one target with no such entry point, which
 *   is why `@janux/node` ships an HTTP bridge and the others do not need one.
 *
 * Writing an adapter means implementing `JanuxAdapter`. It does not mean
 * reading Janux's source: everything an adapter is handed is on `AdapterBuilder`
 * below, and everything it must produce is a `JanuxRequestHandler`.
 */
import type { JanuxAppConfig } from '@janux/vite/config';
import { createJanuxServer } from '@janux/server';
import { prodServerOptions, type PrebuiltApp } from './prod';

/**
 * Serving the built client is the same job on every target that serves it at
 * all (a CDN-backed one does not), so it is part of the adapter surface rather
 * than something each adapter reimplements: compression, caching headers and
 * content types included.
 */
export { staticResponse, cacheControl, contentType } from './static-assets';

/**
 * An app whose modules were resolved at build time, plus the root the *running*
 * deployment sees — `/var/task/...`, not the build machine's directory.
 */
export interface JanuxApp extends PrebuiltApp {
  root: string;
}

/** The one runtime contract. A Janux deployment is a function from a request to a response. */
export interface JanuxRequestHandler {
  fetch(request: Request): Promise<Response>;
}

/**
 * What the target can do. Every flag is declared by the adapter, never sniffed:
 * a capability Janux cannot verify is one an app finds out about in production.
 * `janux build` reports the app features a `false` flag disables.
 */
export interface AdapterCapabilities {
  /** Can hold a connection open for its lifetime — `src/ws.ts` works. */
  websocket: boolean;
  /** Can send a response body in chunks — streaming SSR and `<Suspense>` arrive progressively. */
  streaming: boolean;
  /** Has a writable filesystem while serving — `spoolMultipart` can spool uploads to disk. */
  filesystem: boolean;
}

/** The entry an adapter asks the builder to generate. */
export interface AdapterEntry {
  /**
   * Import statements the entry needs. ESM hoists them above everything, so they
   * must not read `JANUX_APP_ROOT` at import time — the app's own modules do,
   * which is why the builder imports the app dynamically instead.
   */
  imports: string[];
  /** Statements that run with `app` in scope: the generated module of statically imported app modules. */
  body: string;
}

/** Everything an adapter is handed. If something is missing here, that is a gap in this interface. */
export interface AdapterBuilder {
  /** The app root on the build machine. */
  root: string;
  /** The app's resolved conventions: routes dir, api dir, agent module, i18n, output mode… */
  config: JanuxAppConfig;
  /** What `janux build` emitted for the browser — `<root>/dist/client`. */
  clientDir: string;
  /**
   * Writes `.janux/app.ts` — every module the server imports on the way up,
   * imported *statically* so a bundler can see through it — and `.janux/entry.ts`
   * built from `entry`. A deployment has no `node_modules` beside it to resolve
   * `janux` from, so resolving the app at boot is not an option.
   */
  writeEntry(entry: AdapterEntry): Promise<void>;
  /** Bundles the written entry to `outfile` (relative to `root`). Returns its size in bytes. */
  bundle(outfile: string, target: 'node' | 'bun'): Promise<number>;
  /** Copies `dist/client` to `to` (relative to `root`), creating it if needed. */
  copyClient(to: string): void;
  /**
   * Copies a directory the app reads at runtime, and reports whether it was
   * there. `src/` is the one every deployment needs: the bundle inlines the
   * route *modules*, but the router still reads the directory to learn which
   * URLs exist. App data (`content/`, `data/`) is the other case.
   */
  copyDir(from: string, to: string): boolean;
  /** Writes a file the platform expects — a launcher, a manifest, a `package.json`. Parent directories are created. */
  write(path: string, contents: string): Promise<void>;
  log(message: string): void;
}

export interface JanuxAdapter {
  /** Conventionally the package name — it prefixes this adapter's logs and errors. */
  name: string;
  capabilities: AdapterCapabilities;
  /** Runs after `janux build`, with everything that build produced. */
  adapt(builder: AdapterBuilder): Promise<void> | void;
}

/**
 * The runtime half, for the entry an adapter generates.
 *
 * `app` is the generated module: the app's own modules, imported statically so
 * the bundler inlines them. Without it the handler resolves the app from disk
 * the way `janux start` does — which is what a local run wants, and what a
 * bundled deployment cannot do.
 */
export function createRequestHandler(app?: JanuxApp): JanuxRequestHandler {
  let booted: Promise<JanuxRequestHandler> | undefined;

  return {
    fetch(request) {
      booted ??= boot(app);

      return booted.then((server) => server.fetch(request));
    },
  };
}

/** Once per instance, not once per request — a cold start pays for the whole app. */
async function boot(app: JanuxApp | undefined): Promise<JanuxRequestHandler> {
  return createJanuxServer(await prodServerOptions(app?.root ?? process.cwd(), app));
}

/** The app features a target cannot serve, so `adapt()` can say so instead of letting production say it. */
export function unsupportedFeatures(config: JanuxAppConfig, capabilities: AdapterCapabilities): string[] {
  const gaps: string[] = [];

  if (config.websocketModule && !capabilities.websocket) gaps.push('src/ws.ts — this target cannot hold WebSockets open');
  if (!capabilities.streaming) gaps.push('streaming SSR — responses will be buffered before they are sent');
  if (!capabilities.filesystem) gaps.push('spoolMultipart() — this target has no writable filesystem for uploads');

  return gaps;
}
