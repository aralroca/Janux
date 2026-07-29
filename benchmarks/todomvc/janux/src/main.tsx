import { component, intent, schema, str, int, bool, list } from 'janux';
import { boot } from 'janux/client';

// TodoMVC fixture (Janux) — same DOM contract as the sibling apps (see
// ../../README.md). Authored idiomatically for Janux: one island whose intents
// mutate schema-typed state through the reactive proxy, and the delegated
// event system derives each intent's input from the event itself (`value`
// from the dispatched control, `key` from keyboard events) merged with the
// element's `.with()` payload — so the `.new-todo`/`.edit` inputs stay
// uncontrolled exactly like every sibling (handlers read the dispatched
// value, never a synthetic binding). The checkboxes bind `onChange`: the
// native click toggles the control, the change intent folds the new
// checkedness into state, and the keyed morph syncs every other control.
//
// Janux intents resolve through a microtask (the delegated listener mounts
// the island lazily and invokes an async intent), so the fixture exposes
// `window.__benchFlush` — the harness awaits it after every interaction.

let nextId = 1;

interface Todo {
	id: number;
	title: string;
	completed: boolean;
}

/** Commits the open editor: empty text destroys the todo, anything else retitles it. */
function commitEdit(state: any, value: string): void {
	const id = state.editing;

	if (id === 0) return;
	const title = value.trim();

	if (title === '') state.todos = state.todos.filter((todo: Todo) => todo.id !== id);
	else {
		const todo = state.todos.find((item: Todo) => item.id === id);

		if (todo) todo.title = title;
	}
	state.editing = 0;
}

export const TodoMvc = component({
	name: 'todomvc',
	description: 'TodoMVC',

	state: schema({
		todos: list({ id: int(), title: str(), completed: bool() }),
		filter: str().default('all'),
		editing: int().default(0),
	}),

	intents: {
		addTodo: intent({
			description: 'Add a todo from the new-todo input on Enter',
			input: schema({ value: str().default(''), key: str().default('') }),
			run: ({ state, input }: any) => {
				if (input.key !== 'Enter') return;
				const title = input.value.trim();

				if (title === '') return;
				state.todos.push({ id: nextId++, title, completed: false });
			},
		}),
		toggle: intent({
			description: 'Set one todo completed state from its checkbox',
			input: schema({ id: int(), value: bool().default(false) }),
			run: ({ state, input }: any) => {
				const todo = state.todos.find((item: Todo) => item.id === input.id);

				if (todo) todo.completed = input.value;
			},
		}),
		toggleAll: intent({
			description: 'Set every todo completed state from the toggle-all checkbox',
			input: schema({ value: bool().default(false) }),
			run: ({ state, input }: any) => {
				for (const todo of state.todos) {
					if (todo.completed !== input.value) todo.completed = input.value;
				}
			},
		}),
		destroy: intent({
			description: 'Remove one todo',
			input: schema({ id: int() }),
			run: ({ state, input }: any) => {
				state.todos = state.todos.filter((todo: Todo) => todo.id !== input.id);
			},
		}),
		clearCompleted: intent({
			description: 'Remove every completed todo',
			run: ({ state }: any) => {
				state.todos = state.todos.filter((todo: Todo) => !todo.completed);
			},
		}),
		setFilter: intent({
			description: 'Switch the visible filter',
			input: schema({ filter: str() }),
			run: ({ state, input }: any) => {
				state.filter = input.filter;
			},
		}),
		startEdit: intent({
			description: 'Open the inline editor for one todo',
			input: schema({ id: int() }),
			run: ({ state, input }: any) => {
				state.editing = input.id;
			},
		}),
		editKeyDown: intent({
			description: 'Commit the open editor on Enter, cancel it on Escape',
			input: schema({ value: str().default(''), key: str().default('') }),
			run: ({ state, input }: any) => {
				if (input.key === 'Enter') commitEdit(state, input.value);
				else if (input.key === 'Escape') state.editing = 0;
			},
		}),
		editBlur: intent({
			description: 'Commit the open editor when it loses focus',
			input: schema({ value: str().default('') }),
			run: ({ state, input }: any) => {
				commitEdit(state, input.value);
			},
		}),
	},

	view: ({ state, intents }: any) => {
		// One pass over the list per render: this body runs inside the measured
		// interaction window, so no throwaway arrays just to count.
		let remaining = 0;

		for (const todo of state.todos) if (!todo.completed) remaining += 1;
		const visible =
			state.filter === 'active'
				? state.todos.filter((todo: Todo) => !todo.completed)
				: state.filter === 'completed'
					? state.todos.filter((todo: Todo) => todo.completed)
					: state.todos;
		const anyCompleted = state.todos.length - remaining > 0;

		return (
			<section class="todoapp">
				<header class="header">
					<h1>todos</h1>
					<input class="new-todo" placeholder="What needs to be done?" onKeyDown={intents.addTodo} />
				</header>
				{state.todos.length > 0 ? (
					<section class="main">
						<input
							id="toggle-all"
							class="toggle-all"
							type="checkbox"
							checked={remaining === 0}
							onChange={intents.toggleAll}
						/>
						<ul class="todo-list">
							{visible.map((todo: Todo) => (
								<li
									key={todo.id}
									class={
										(todo.completed ? 'completed' : '') +
										(state.editing === todo.id ? ' editing' : '')
									}
								>
									<div class="view">
										<input
											class="toggle"
											type="checkbox"
											checked={todo.completed}
											onChange={intents.toggle.with({ id: todo.id })}
										/>
										<label onDoubleClick={intents.startEdit.with({ id: todo.id })}>
											{todo.title}
										</label>
										<button class="destroy" onClick={intents.destroy.with({ id: todo.id })} />
									</div>
									{state.editing === todo.id ? (
										<input
											class="edit"
											value={todo.title}
											onKeyDown={intents.editKeyDown}
											onBlur={intents.editBlur}
										/>
									) : null}
								</li>
							))}
						</ul>
					</section>
				) : null}
				{state.todos.length > 0 ? (
					<footer class="footer">
						<span class="todo-count">
							<strong>{remaining}</strong>
							{remaining === 1 ? ' item left' : ' items left'}
						</span>
						<ul class="filters">
							{['all', 'active', 'completed'].map((filter: string) => (
								<li key={filter}>
									<a
										class={state.filter === filter ? 'selected' : ''}
										data-filter={filter}
										onClick={intents.setFilter.with({ filter })}
									>
										{filter[0]!.toUpperCase() + filter.slice(1)}
									</a>
								</li>
							))}
						</ul>
						{anyCompleted ? (
							<button class="clear-completed" onClick={intents.clearCompleted}>
								Clear completed
							</button>
						) : null}
					</footer>
				) : null}
			</section>
		);
	},
});

const client = boot({ defs: [TodoMvc], navigation: false, webmcp: false });

// The harness awaits this after every interaction: `settled()` drains the
// delegated event's mount+intent microtask chain AND the render it triggers.
(window as any).__benchFlush = () => client.settled();
