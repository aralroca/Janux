import { jsx } from 'janux';
import { renderToString } from 'janux/server';
import { stateScripts } from '../snapshot-scripts';
import { HydrationApp } from './App';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	const { html, snapshots } = await renderToString(
		jsx(HydrationApp, { initial: { controlled: props.controlled === true } }, '1'),
	);

	return { head: stateScripts(snapshots), body: html, css: '' };
}
