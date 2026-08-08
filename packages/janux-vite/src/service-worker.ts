/**
 * The build side of `src/sw.ts`.
 *
 * A service worker's one hard requirement is a list of URLs it can precache,
 * and that list is exactly what a worker cannot compute for itself: the names
 * are decided by the bundler, minutes earlier, on another machine. So the build
 * reads its own output back and substitutes the answer in.
 *
 * The worker is a production artifact. `janux dev` neither builds nor registers
 * one, because a worker installed while a page is being written outlives the
 * edit that installed it: the next `bun run dev` is served by a cache from the
 * last one, and the hour that follows is spent blaming the framework. Build the
 * app and `janux start` it to exercise the worker.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ServiceWorkerConfig } from 'janux';
import { toPosix } from './app-config';

/** The worker's URL. Root of the output, so its scope is the whole site. */
export const SERVICE_WORKER_FILE = 'sw.js';

/**
 * What never goes on the precache list.
 *
 * `.html` is the load-bearing one: precached files are answered cache-first,
 * and a document answered cache-first is how a visitor gets pinned to the
 * deploy they first met. Pages are network-first with a cached fallback, which
 * is the opposite trade and the right one. The rest are files no page fetches —
 * sourcemaps belong to devtools, `.md` projections to agents, `islands.json` to
 * the server — so precaching them would only make a first visit slower.
 */
const SKIP_EXTENSIONS = ['.html', '.map', '.md'];
const SKIP_FILES = [SERVICE_WORKER_FILE, 'islands.json'];

function precacheable(path: string): boolean {
  return !SKIP_FILES.includes(path) && !SKIP_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * Every file in the built client worth precaching, as the URL paths a page
 * requests them by — sorted, so the version below is a function of the output
 * and not of the order the filesystem happened to answer in.
 */
export function serviceWorkerAssets(outDir: string): string[] {
  if (!existsSync(outDir)) return [];

  return readdirSync(outDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    // `relative()`, never a slice by `outDir.length`: `parentPath` is what the
    // OS resolved, not the string that was passed in. On Windows a `/tmp/x`
    // argument comes back as `D:\tmp\x`, and a slice sized to the shorter form
    // leaves the tail of the drive prefix on every path — `/s/client.js`, with
    // `sw.js` and `islands.json` no longer matching their own exclusions.
    .map((entry) => toPosix(relative(outDir, join(entry.parentPath, entry.name))))
    .filter(precacheable)
    .sort()
    .map((path) => `/${path}`);
}

/**
 * This build's id: a hash of every precached file's name AND bytes.
 *
 * Names alone would be tempting — they carry content hashes already — but
 * `public/` files and `/styles.css` do not, so an app whose only change was an
 * image would ship a new build under the old version and every visitor would
 * keep the old copy forever. Bytes make the version mean what it claims.
 */
export function serviceWorkerVersion(outDir: string, assets: string[]): string {
  const hash = createHash('sha256');

  assets.forEach((path) => hash.update(path).update(readFileSync(join(outDir, path.slice(1)))));

  return hash.digest('hex').slice(0, 16);
}

/**
 * The URL `janux start` registers, or nothing.
 *
 * Nothing has three causes, all of them ordinary: the app has no `src/sw.ts`,
 * the app has one but has not been built yet, or the app asked to register the
 * worker itself (`serviceWorker: { register: false }`) — in which case the file
 * is still built and served, and only the automatic sign-up is withheld.
 */
/**
 * Deletes a worker the app no longer has a `src/sw.ts` for. Returns whether
 * there was one.
 *
 * Deleting the source has to be enough to be rid of it. A build that only ever
 * *adds* would keep serving and registering the last one — and a worker still
 * running because nobody swept the output directory is exactly the surprise
 * this feature is careful about. It is also how a browser retires a worker it
 * already installed: the update check 404s, and the registration goes.
 */
export function retireServiceWorker(outDir: string, root?: string): boolean {
  const worker = join(outDir, SERVICE_WORKER_FILE);

  if (!existsSync(worker)) return false;
  // A worker the app ships by hand in public/ reached the output through the
  // verbatim copy, not through `src/sw.ts` — it is not ours to retire.
  if (root && existsSync(join(root, 'public', SERVICE_WORKER_FILE))) return false;
  rmSync(worker, { force: true });
  rmSync(`${worker}.map`, { force: true });

  return true;
}

export function builtServiceWorker(outDir: string, config: ServiceWorkerConfig | undefined): string | undefined {
  if (config?.register === false) return undefined;

  return existsSync(join(outDir, SERVICE_WORKER_FILE)) ? `/${SERVICE_WORKER_FILE}` : undefined;
}
