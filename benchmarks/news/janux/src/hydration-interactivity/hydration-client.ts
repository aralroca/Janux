import { boot } from 'janux/client';
import { completeHydration, readHydrationDraft } from '../../../../hydration-interactivity/shared.js';
import { HydrationApp } from './App';

// What "hydration" measures for Janux, honestly: `boot()` resumes the page —
// it indexes the SSR snapshot, installs the delegated listeners, and starts
// the (async, microtask-resolved) island mount that adopts the server DOM in
// place. There is NO pre-hydration event capture/replay: like preact and
// solid, a click that lands before this chunk executes is lost (the SSR HTML
// does carry the intent markers, but the delegated listeners that read them
// only exist once boot() has run), so the replay scenarios score Janux the
// same way they score those targets — delivered-before-chunk: no, replayed: no.
export function hydrateBenchmark() {
	return completeHydration(() => {
		seedDraftSnapshot();
		const client = boot({ defs: [HydrationApp], navigation: false, webmcp: false });

		void client.mount('hydration#1');

		return client;
	});
}

// The rivals seed their draft state from the DOM at hydration time
// (`useState(readHydrationDraft)`): text typed before hydration must survive a
// controlled first render even when the input is no longer focused (the user
// already clicked Send). Janux resumes state from the SSR snapshot, so the
// equivalent seeding point is the snapshot itself, patched before boot reads it.
function seedDraftSnapshot() {
	const script = document.querySelector(
		'script[type="application/janux+state"][data-uri="ui://hydration#1"]',
	);

	if (!script) return;
	try {
		const snapshot = JSON.parse(script.textContent ?? '{}');

		snapshot.state = { ...snapshot.state, draft: readHydrationDraft() };
		script.textContent = JSON.stringify(snapshot).replace(/</g, '\\u003c');
	} catch {
		// An unreadable snapshot falls back to schema defaults inside boot().
	}
}
