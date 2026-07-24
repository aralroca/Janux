import { renderToString } from 'janux';

/** What `htmlDocument` puts in every server-rendered page (a static export omits it). */
const MANIFEST_LINK = '<link rel="janux-manifest" id="jx-manifest" href="/_janux/manifest?path=%2F">';

const snapshotScripts = (snapshots: any[]): string =>
  snapshots
    .map(
      (snapshot) =>
        `<script type="application/janux+state" data-uri="${snapshot.uri}">${JSON.stringify({ state: snapshot.state, sources: snapshot.sources ?? {} })}</script>`,
    )
    .join('');

/**
 * Puts a server-rendered page into the DOM the way the real shell does — markup,
 * state snapshots and the manifest link — so `boot()` sees what it sees in a
 * browser. Needs happy-dom registered by the caller.
 */
export async function serveIntoDom(node: unknown, ctx: Record<string, unknown> = {}): Promise<void> {
  const { html, snapshots } = await renderToString(node, ctx as any);

  document.body.innerHTML = MANIFEST_LINK + html + snapshotScripts(snapshots as any[]);
}
