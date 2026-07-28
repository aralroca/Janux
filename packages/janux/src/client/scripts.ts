/**
 * Scripts that arrive with a navigated page.
 *
 * The whole-document diff inserts *clones*, and a cloned script is inert: in
 * Chrome, a page whose markup ships an inline script (an embed, an analytics
 * call, a widget bootstrap) got its HTML on an SPA navigation and none of its
 * behaviour — measured, `0` executions. Brisa solves it by re-creating the
 * scripts a navigation brings; this does the same, driven by a MutationObserver
 * rather than by the diff's node callback, because that callback does not see
 * every node the walk inserts (it stops at `BODY` for a whole-document diff).
 *
 * Identity is `src`, then `id`, then the code itself: the last one is what keeps
 * a page's theme-restore snippet — or an analytics call — from running again on
 * every navigation, since the incoming page ships the same text as the live one.
 */

const RAN_MARKER = 'jxRan';
/** Data blocks are read, not executed: snapshots the client resumes from, i18n payloads, JSON-LD. */
const DATA_TYPES = /^application\/(janux\+state|janux\+i18n|ld\+json)$/;

function identity(script: HTMLScriptElement): string {
  // `getAttribute`, not the `.id` IDL reflection: the reflection returns `''`
  // (never null) for a script without the attribute, which used to collapse
  // every no-src/no-id script on the page to one shared identity.
  return script.getAttribute('src') ?? script.getAttribute('id') ?? script.textContent ?? '';
}

function isExecutable(script: HTMLScriptElement): boolean {
  return !DATA_TYPES.test(script.getAttribute('type') ?? '') && !(RAN_MARKER in script.dataset);
}

/** What the live document has already run, before the incoming page is applied. */
function ranAlready(): Set<string> {
  return new Set([...document.scripts].map(identity));
}

function execute(inert: HTMLScriptElement): void {
  const fresh = document.createElement('script');

  [...inert.attributes].forEach(({ name, value }) => fresh.setAttribute(name, value));
  fresh.dataset[RAN_MARKER] = '';
  fresh.textContent = inert.textContent;
  // In place, so the page's own order is the order they run in.
  inert.replaceWith(fresh);
}

/**
 * Scripts the diff brought in, including the ones inside a subtree it replaced
 * wholesale — a whole-document diff can swap the entire `<body>` in one node, and
 * every script a page carries then arrives as a descendant rather than as an
 * addition of its own.
 */
function newScripts(records: MutationRecord[]): HTMLScriptElement[] {
  return records
    .flatMap((record) => [...record.addedNodes])
    .flatMap((node) => {
      if (node.nodeName === 'SCRIPT') return [node as HTMLScriptElement];
      if (!(node instanceof Element)) return [];

      return [...node.querySelectorAll('script')];
    });
}

/**
 * Runs the scripts a navigation brings, as the diff inserts them — a script that
 * arrives mid-stream runs mid-stream. Returns the teardown.
 */
export function runScriptsWhileStreaming(): () => void {
  const ran = ranAlready();
  const run = (records: MutationRecord[]) =>
    newScripts(records)
      .filter((script) => isExecutable(script) && !ran.has(identity(script)))
      .forEach((script) => {
        ran.add(identity(script));
        execute(script);
      });
  const observer = new MutationObserver(run);

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Records queued but not yet delivered are dropped by `disconnect()`, and the
  // teardown runs the moment the diff resolves — which is exactly when the last
  // chunk's scripts are sitting in that queue.
  return () => {
    run(observer.takeRecords());
    observer.disconnect();
  };
}
