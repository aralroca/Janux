import { component, For, intent, schema, str, int, list } from 'janux';
import { boot } from 'janux/client';

// Janux js-framework-benchmark fixture (keyed). Same DOM contract as the
// react / solid / svelte columns: the six create/update/clear/swap buttons
// (#run #runlots #add #update #clear #swaprows) plus the per-row select/remove
// <a> tags are driven by ../../run.mjs; the SECOND jumbotron button row is the
// keyed-reorder matrix driven by ../../run-reorder.mjs.
//
// Authored idiomatically for Janux: one island whose intents mutate schema-typed
// state through the reactive proxy, and a fine-grained `<For each key>` for the
// rows — Janux's per-row reactive scope, the counterpart of Solid's `<For>`.
// Every permutation op replaces `state.rows` with a fresh array carrying the
// SAME rows (same `id`, same field values), so `<For>` matches each row by key,
// finds its data unchanged, and MOVES the existing <tr> rather than rebuilding
// it. `update` replaces the touched row objects (like the react/solid columns),
// so only those 100 rows re-render.
//
// Janux intents resolve through a microtask (the delegated click handler mounts
// lazily and invokes an async intent), so the fixture exposes
// `window.__benchFlush` — the harness awaits it after every click.

const A = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy'];
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange'];
const N = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard'];

let nextId = 1;
const random = (max: number) => (Math.random() * max) | 0;

interface Row {
	id: number;
	label: string;
}

function buildData(count: number): Row[] {
	const data = new Array(count);

	for (let i = 0; i < count; i++) {
		data[i] = {
			id: nextId++,
			label: `${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`,
		};
	}

	return data;
}

// ── Deterministic shuffle machinery (BYTE-IDENTICAL across all bench fixtures,
// replayed by ../../run-reorder.mjs for its identity gate) ──────────────────
function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const SHUFFLE_SEED = 42;
const shuffleSeeds = mulberry32(SHUFFLE_SEED);
const nextShuffleSeed = () => (shuffleSeeds() * 4294967296) >>> 0;

function shuffleWithSeed(d: Row[], seed: number): Row[] {
	const rand = mulberry32(seed);
	const out = d.slice();

	for (let i = out.length - 1; i > 0; i--) {
		const j = (rand() * (i + 1)) | 0;
		const tmp = out[i];

		out[i] = out[j];
		out[j] = tmp;
	}

	return out;
}

/** Declares a no-input intent that replaces `state.rows` with `fn(current)`. */
const rowsIntent = (description: string, fn: (rows: Row[]) => Row[]) =>
	intent({
		description,
		run: ({ state }: any) => {
			state.rows = fn(state.rows);
		},
	});

export const Bench = component({
	name: 'bench',
	description: 'krausest js-framework-benchmark rows',

	state: schema({
		rows: list({ id: int(), label: str() }),
		selected: int().default(0),
	}),

	intents: {
		run: rowsIntent('Create 1,000 rows', () => buildData(1000)),
		runLots: rowsIntent('Create 10,000 rows', () => buildData(10000)),
		add: rowsIntent('Append 1,000 rows', (rows) => rows.concat(buildData(1000))),
		update: rowsIntent('Update every 10th row label', (rows) => {
			const out = rows.slice();

			for (let i = 0; i < out.length; i += 10) out[i] = { id: out[i]!.id, label: `${out[i]!.label} !!!` };

			return out;
		}),
		clear: rowsIntent('Clear all rows', () => []),
		swapRows: rowsIntent('Swap rows 1 and 998', (rows) => {
			if (rows.length <= 998) return rows;
			const out = rows.slice();
			const tmp = out[1]!;

			out[1] = out[998]!;
			out[998] = tmp;

			return out;
		}),
		select: intent({
			description: 'Select a row by id',
			input: schema({ id: int() }),
			run: ({ state, input }: any) => {
				state.selected = input.id;
			},
		}),
		remove: intent({
			description: 'Remove a row by id',
			input: schema({ id: int() }),
			run: ({ state, input }: any) => {
				state.rows = state.rows.filter((row: Row) => row.id !== input.id);
			},
		}),
		reverse: rowsIntent('Reverse rows', (rows) => rows.slice().reverse()),
		shuffle: rowsIntent('Shuffle rows (seeded)', (rows) => shuffleWithSeed(rows, nextShuffleSeed())),
		rotateForward: rowsIntent('Rotate last to front', (rows) =>
			rows.length === 0 ? rows : [rows[rows.length - 1]!, ...rows.slice(0, -1)],
		),
		rotateBackward: rowsIntent('Rotate first to end', (rows) =>
			rows.length === 0 ? rows : [...rows.slice(1), rows[0]!],
		),
		prepend100: rowsIntent('Prepend 100 rows', (rows) => buildData(100).concat(rows)),
		append100: rowsIntent('Append 100 rows', (rows) => rows.concat(buildData(100))),
		insertMid100: rowsIntent('Insert 100 rows at middle', (rows) => {
			const mid = rows.length >> 1;

			return rows.slice(0, mid).concat(buildData(100), rows.slice(mid));
		}),
		removeFirst: rowsIntent('Remove first row', (rows) => rows.slice(1)),
		removeEvery10: rowsIntent('Remove every 10th row', (rows) =>
			rows.filter((_: Row, i: number) => i % 10 !== 0),
		),
		displace: intent({
			description: 'Move the first k rows (as a group) to the end',
			input: schema({ k: int() }),
			run: ({ state, input }: any) => {
				state.rows = state.rows.slice(input.k).concat(state.rows.slice(0, input.k));
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<div class="container">
			<div class="jumbotron">
				<div class="row">
					<div class="col-md-6">
						<h1>Janux keyed</h1>
					</div>
					<div class="col-md-6">
						<div class="row">
							{[
								['run', 'Create 1,000 rows', intents.run],
								['runlots', 'Create 10,000 rows', intents.runLots],
								['add', 'Append 1,000 rows', intents.add],
								['update', 'Update every 10th row', intents.update],
								['clear', 'Clear', intents.clear],
								['swaprows', 'Swap Rows', intents.swapRows],
							].map(([id, label, run]: any) => (
								<div class="col-sm-6 smallpad" key={id}>
									<button type="button" class="btn btn-primary btn-block" id={id} onClick={run}>
										{label}
									</button>
								</div>
							))}
						</div>
						<div class="row">
							{[
								['reverse', 'Reverse rows', intents.reverse],
								['shuffle', 'Shuffle rows (seeded)', intents.shuffle],
								['rotatef', 'Rotate last to front', intents.rotateForward],
								['rotateb', 'Rotate first to end', intents.rotateBackward],
								['prepend100', 'Prepend 100 rows', intents.prepend100],
								['append100', 'Append 100 rows', intents.append100],
								['insertmid100', 'Insert 100 rows at middle', intents.insertMid100],
								['removefirst', 'Remove first row', intents.removeFirst],
								['removeevery10', 'Remove every 10th row', intents.removeEvery10],
								['displace3', 'Displace first 3 to end', intents.displace.with({ k: 3 })],
								['displace4', 'Displace first 4 to end', intents.displace.with({ k: 4 })],
								['displace5', 'Displace first 5 to end', intents.displace.with({ k: 5 })],
								['displace6', 'Displace first 6 to end', intents.displace.with({ k: 6 })],
								['displace8', 'Displace first 8 to end', intents.displace.with({ k: 8 })],
							].map(([id, label, run]: any) => (
								<div class="col-sm-6 smallpad" key={id}>
									<button type="button" class="btn btn-primary btn-block" id={id} onClick={run}>
										{label}
									</button>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<table class="table table-hover table-striped test-data">
				<tbody>
					<For each={state.rows} by={(row: Row) => row.id}>
						{(row: Row) => (
							// A THUNK, not a value: the row body never reads `state.selected`, so
							// selecting a row re-runs one attribute write per row instead of a
							// thousand row bodies. Same shape solid/vue-vapor compile to.
							<tr class={() => (state.selected === row.id ? 'danger' : '')}>
								<td class="col-md-1">{row.id}</td>
								<td class="col-md-4">
									<a onClick={intents.select.with({ id: row.id })}>{row.label}</a>
								</td>
								<td class="col-md-1">
									<a onClick={intents.remove.with({ id: row.id })}>
										<span class="glyphicon glyphicon-remove" aria-hidden="true" />
									</a>
								</td>
								<td class="col-md-6" />
							</tr>
						)}
					</For>
				</tbody>
			</table>
			<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
		</div>
	),
});

const client = boot({ defs: [Bench], navigation: false, webmcp: false });

// The harness awaits this after every click: `settled()` drains the delegated
// click's mount+intent microtask chain AND the synchronous render it triggers.
(window as any).__benchFlush = () => client.settled();
