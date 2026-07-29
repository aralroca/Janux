import { bool, component, effect, int, intent, list, schema } from 'janux';
import {
	SELECTOR_SUBSCRIBERS,
	getStoreSelectorStress,
	markSubscriberRender,
	selectTotal,
} from '../../../../store-selector-fanout/shared.js';

// The suite's measured signal is selector calls during UNRELATED parent
// re-renders. Janux's story: rendering never consults the store — the view
// reads island state only, and the store reaches state through per-subscriber
// listeners with a snapshot-keyed selection cache (the same cache shape as
// React's use-sync-external-store/with-selector). A `bump` re-render therefore
// runs zero selectors and zero snapshot reads; a real write runs the selection
// once per subscriber, exactly like the render-pass frameworks.

// Latest per-subscriber selections, staged by the listeners and committed into
// island state by one coalesced `sync` intent per notification burst.
const latestTotals = SELECTOR_SUBSCRIBERS.map(() => 0);

export const SelectorPanel = component({
	name: 'selector',
	description: '512 selector-based store subscribers under unrelated parent re-renders',

	state: schema({
		visible: bool().default(false),
		generation: int().default(0),
		totals: list(int()).default(SELECTOR_SUBSCRIBERS.map(() => 0)),
	}),

	intents: {
		toggle: intent({
			description: 'Toggle subscribers',
			run: ({ state }: any) => {
				state.visible = !state.visible;
			},
		}),
		write: intent({
			description: 'Write every store value',
			run: () => {
				getStoreSelectorStress().store.writeAll(7);
			},
		}),
		rewrite: intent({
			description: 'Rewrite every store value',
			run: () => {
				getStoreSelectorStress().store.writeAll(9);
			},
		}),
		bump: intent({
			description: 'Unrelated parent re-render',
			run: ({ state }: any) => {
				state.generation += 1;
			},
		}),
		sync: intent({
			description: 'Commit the staged selections into island state',
			run: ({ state }: any) => {
				state.totals = latestTotals.slice();
			},
		}),
	},

	effects: {
		subscribers: effect({
			when: (state: any) => state.visible,
			run: ({ state, intents }: any) => {
				if (!state.visible) return undefined;
				const store = getStoreSelectorStress().store;
				const caches = SELECTOR_SUBSCRIBERS.map(() => ({
					snapshot: null as unknown,
					selection: 0,
				}));
				let scheduled = false;
				const read = (index: number) => {
					const snapshot = store.getSnapshot();
					const cache = caches[index]!;

					if (snapshot !== cache.snapshot) {
						cache.snapshot = snapshot;
						cache.selection = selectTotal((snapshot as any).values);
					}
					latestTotals[index] = cache.selection;
				};
				const schedule = () => {
					if (scheduled) return;
					scheduled = true;
					queueMicrotask(() => {
						scheduled = false;
						void intents.sync();
					});
				};
				const unsubscribes = SELECTOR_SUBSCRIBERS.map((index) =>
					store.subscribe(() => {
						read(index);
						schedule();
					}),
				);

				// Initial selection at mount, once per subscriber — the same
				// first-read every rival's subscribe hook performs.
				SELECTOR_SUBSCRIBERS.forEach(read);
				void intents.sync();

				return () => {
					unsubscribes.forEach((unsubscribe) => unsubscribe());
				};
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<main>
			<button id="selector-toggle" type="button" onClick={intents.toggle}>
				Toggle subscribers
			</button>
			<button id="selector-write" type="button" onClick={intents.write}>
				Write every store value
			</button>
			<button id="selector-rewrite" type="button" onClick={intents.rewrite}>
				Rewrite every store value
			</button>
			<output id="selector-generation">{state.generation}</output>
			{state.visible ? (
				<div id="selector-subscribers">
					{SELECTOR_SUBSCRIBERS.map((index) => {
						markSubscriberRender();

						return (
							<output data-subscriber-index={index} data-generation={state.generation} key={index}>
								{state.totals[index]}
							</output>
						);
					})}
				</div>
			) : null}
		</main>
	),
});
