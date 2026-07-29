import { renderToString } from 'janux/server';
import { App } from './App';
import { stateScripts } from './snapshot-scripts';

export async function renderApp(): Promise<{ head: string; body: string; css: string }> {
	const { html, snapshots } = await renderToString(App());

	// Island snapshots ship in <head> (outside #app) so the no-rebuild gate
	// compares only the semantic body tree — same split the real server shell uses.
	return { head: stateScripts(snapshots), body: html, css: '' };
}
