import type { RenderResult } from 'janux/server';

/**
 * The state shell Janux's server package emits, calqued by hand: these
 * fixtures are standalone Vite apps measuring the CORE (renderToString +
 * client resume), so they splice the snapshots into the harness template
 * themselves instead of pulling in @janux/server's whole document shell.
 * Format mirrors `stateScripts` in packages/janux-server/src/html-shell.ts.
 */
export function stateScripts(snapshots: RenderResult['snapshots']): string {
	return snapshots
		.map((snapshot) => {
			const payload = JSON.stringify({ state: snapshot.state, sources: snapshot.sources ?? {} })
				// `<` escaped so `</script>` inside state can never break out.
				.replace(/</g, '\\u003c');

			return `<script type="application/janux+state" data-uri="${snapshot.uri}">${payload}</script>`;
		})
		.join('\n');
}
