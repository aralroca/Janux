import { component, source } from 'janux';
import type { CardData, CardSlot } from './data';
import { CARD_COUNT } from './data';

// Streaming product page — Janux target. Same DOM shape + data schedule as the
// sibling fixtures. Each card is an island with a `suspense` view: the shell
// streams with skeletons and every boundary swaps in (out of order) when its
// data resolves. Sources read per-render data through `ctx.cards` — one def
// per card index, generated below, because a source query is a function of
// `ctx` alone.

function CardBody({ data }: { data: CardData }) {
	return (
		<article class="card">
			<h3 class="title">{data.title}</h3>
			<p class="sub">{data.subtitle}</p>
			<ul class="specs">
				{data.items.map((it) => (
					<li class="spec" key={it.label}>
						<span class="label">{it.label}</span>
						<span class="value">{it.value}</span>
					</li>
				))}
			</ul>
			<div class="meta">
				<span class="tag">{data.tag}</span>
				<span class="note">{data.note}</span>
			</div>
		</article>
	);
}

const cardDef = (index: number) =>
	component({
		name: `card-${index}`,
		description: `Streamed product card ${index}`,
		sources: {
			data: source({
				query: ({ ctx }: any) => (ctx.cards as CardSlot[])[index]!.promise,
			}),
		},
		suspense: () => (
			<div class="skeleton">
				<div class="bar" />
				<div class="bar" />
				<div class="bar" />
			</div>
		),
		view: ({ sources }: any) => <CardBody data={sources.data.value} />,
	});

const CARDS = Array.from({ length: CARD_COUNT }, (_, index) => cardDef(index));

export function App() {
	return (
		<div class="site">
			<header class="masthead">
				<h1 class="brand">Octane Outfitters</h1>
				<p class="tagline">streaming SSR benchmark storefront</p>
				<nav class="nav">
					<ul class="links">
						{['home', 'new', 'sale', 'gear', 'parts', 'labs', 'blog', 'help'].map((n) => (
							<li class="link" key={n}>
								<a href={'/' + n}>{n}</a>
							</li>
						))}
					</ul>
				</nav>
			</header>
			<section class="hero">
				<h2 class="pitch">Ten cards, one stream</h2>
				<p class="blurb">The shell flushes immediately; each card streams when its data resolves.</p>
				<div class="stats">
					<div class="stat">
						<span class="num">10</span>
						<span class="cap">boundaries</span>
					</div>
					<div class="stat">
						<span class="num">50</span>
						<span class="cap">shell elements</span>
					</div>
					<div class="stat">
						<span class="num">20</span>
						<span class="cap">elements per card</span>
					</div>
				</div>
			</section>
			<main class="grid">
				{CARDS.map((Card, index) => (
					<section class="slot" key={index}>
						<Card />
					</section>
				))}
			</main>
			<footer class="foot">
				<p class="fine">Octane Outfitters — streaming SSR benchmark</p>
				<small class="legal">same DOM shape and data schedule across all frameworks</small>
			</footer>
		</div>
	);
}
