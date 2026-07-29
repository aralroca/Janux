import { bool, component, intent, schema } from 'janux';
import { ARTICLES } from './data.js';

// The masthead is the page's single island: theme toggling is the only
// interactive surface, so the article feed stays static HTML (Janux ships no
// component code for it). The harness clicks #theme after `__hydrate()` and
// expects `header.masthead`'s class to change.
export const Header = component({
	name: 'news-header',
	description: 'The Octane Times masthead with a dark-mode toggle',

	state: schema({ dark: bool().default(false) }),

	intents: {
		toggle: intent({
			description: 'Toggle dark mode',
			run: ({ state }: any) => {
				state.dark = !state.dark;
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<header class={state.dark ? 'masthead dark' : 'masthead'}>
			<h1 class="logo">The Octane Times</h1>
			<button id="theme" class="theme" onClick={intents.toggle}>
				{state.dark ? 'Light mode' : 'Dark mode'}
			</button>
		</header>
	),
});

export function App() {
	return (
		<div class="site">
			<Header key="1" />
			<main class="feed">
				{ARTICLES.map((article: any) => (
					<article class="card" key={article.id}>
						<span class="section">{article.section}</span>
						<h2 class="title">{article.title}</h2>
						<p class="byline">{article.byline}</p>
						<p class="lead">{article.lead}</p>
						<p class="body">{article.body1}</p>
						<p class="body">{article.body2}</p>
					</article>
				))}
			</main>
			<footer class="foot">The Octane Times — SSR + hydration benchmark</footer>
		</div>
	);
}
