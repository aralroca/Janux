export const meta = {
  title: 'No connection — Basecamp',
  description: 'The page the service worker answers with when a page you never opened is asked for offline.',
};

/**
 * The fallback named in `src/sw.ts`. It is an ordinary route — prerendered like
 * every other page — that the worker precaches on install, which is the only
 * way it can be there on the one occasion it is wanted.
 */
export default function Offline() {
  return (
    <>
      <h1>No connection</h1>
      <p class="lede">
        This page was never downloaded, and there is no network to fetch it with. Everything you opened before you
        lost signal is still available.
      </p>

      <ul class="elsewhere">
        <li>
          <a href="/">Basecamp</a> — the checklist
        </li>
        <li>
          <a href="/signals">Signals</a> — the distress calls
        </li>
      </ul>
    </>
  );
}
