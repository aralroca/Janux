import { bool, component, For, int, intent, schema, str } from 'janux';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

export const HydrationApp = component({
	name: 'hydration',
	description: 'Hydration interactivity benchmark page',

	state: schema({
		controlled: bool().default(false),
		draft: str().default(INITIAL_VALUE),
		clicks: int().default(0),
		focuses: int().default(0),
		submitted: str().default(INITIAL_VALUE),
	}),

	intents: {
		type: intent({
			description: 'Track the search draft',
			input: schema({ value: str() }),
			run: ({ state, input }: any) => {
				state.draft = input.value;
			},
		}),
		send: intent({
			description: 'Send the current search query',
			run: ({ state }: any) => {
				const input = document.querySelector('#hydration-input') as HTMLInputElement | null;
				const query = input?.value ?? INITIAL_VALUE;

				state.draft = query;
				state.submitted = query;
				state.clicks += 1;
			},
		}),
		focus: intent({
			description: 'Count Send-button focuses',
			run: ({ state }: any) => {
				state.focuses += 1;
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<main class="hydration-page">
			<h1>Hydration interactivity benchmark</h1>
			<section class="hydration-editor">
				<label for="hydration-input">Search query</label>
				{state.controlled ? (
					<input
						id="hydration-input"
						type="search"
						autocomplete="off"
						value={() => state.draft}
						onInput={intents.type}
					/>
				) : (
					<input id="hydration-input" type="search" autocomplete="off" onInput={intents.type} />
				)}
				<output id="hydration-output">{() => state.draft}</output>
				<button id="hydration-action" type="button" onClick={intents.send} onFocus={intents.focus}>
					Send search
				</button>
				<output id="hydration-clicks">{() => state.clicks}</output>
				<output id="hydration-focuses">{() => state.focuses}</output>
				<output id="hydration-submitted">{() => state.submitted}</output>
			</section>
			{/* The card list never changes, so `<For>` with a thunk `each` diffs it
			    once and then owns it: typing re-renders the editor above, not a
			    hundred cards that could not have moved. */}
			<ul id="hydration-cards">
				<For each={() => CARDS} by={(card: any) => card.id}>
					{(card: any) => (
						<li class="hydration-card" data-card-id={card.id}>
							<h2>{card.title}</h2>
							<p>{card.description}</p>
						</li>
					)}
				</For>
			</ul>
		</main>
	),
});
