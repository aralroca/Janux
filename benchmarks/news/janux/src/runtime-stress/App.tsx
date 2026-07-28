import { bool, component, effect, int, intent, list, schema, str } from 'janux';
import {
	FORM_FIELDS,
	LIFECYCLE_ROWS,
	STORE_SUBSCRIBERS,
	getRuntimeStress,
	markFieldRender,
	markStoreRender,
	mountLifecycleResource,
	recordValidation,
} from '../../../../runtime-stress/shared.js';

// Four sibling islands, one per stress surface, so a store fan-out never
// re-morphs the 512-field form and vice versa. Where the rivals hold per-row
// resources in per-component effects (useEffect), Janux's unit of lifecycle is
// the island: each panel's `effects` entry mounts/releases its row resources
// when the owning state flips, and `lifecycle`-equivalent cleanup runs through
// the effect's returned Cleanup — the framework's real teardown path.

// ── Lifecycle soak ────────────────────────────────────────────────────────────

export const LifecyclePanel = component({
	name: 'stress-lifecycle',
	description: 'Mount/update/unmount soak rows with real leak-detecting resources',

	state: schema({
		visible: bool().default(false),
		tick: int().default(0),
	}),

	intents: {
		toggle: intent({
			description: 'Toggle lifecycle rows',
			run: ({ state }: any) => {
				state.visible = !state.visible;
			},
		}),
		update: intent({
			description: 'Update lifecycle rows',
			run: ({ state }: any) => {
				state.tick += 1;
			},
		}),
	},

	effects: {
		// The effect IS the per-row resource lifecycle: it (re)runs when
		// `visible` flips, and its returned cleanup releases every row's timer,
		// DOM listener and store subscription exactly once.
		rows: effect({
			when: (state: any) => state.visible,
			run: ({ state }: any) => {
				if (!state.visible) return undefined;
				const cleanups = LIFECYCLE_ROWS.map((index) => mountLifecycleResource(index));

				return () => {
					cleanups.forEach((cleanup) => cleanup());
				};
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<section aria-label="Lifecycle soak">
			<button id="lifecycle-toggle" type="button" onClick={intents.toggle}>
				Toggle lifecycle rows
			</button>
			<button id="lifecycle-update" type="button" onClick={intents.update}>
				Update lifecycle rows
			</button>
			{state.visible ? (
				<ul>
					{LIFECYCLE_ROWS.map((index) => (
						<li data-lifecycle-row={index} key={index}>{`${index}:${state.tick}`}</li>
					))}
				</ul>
			) : null}
		</section>
	),
});

// ── Controlled form (512 fields) ──────────────────────────────────────────────

export const FormPanel = component({
	name: 'stress-form',
	description: 'A 512-field controlled form with checkbox/radio/select and async validation',

	state: schema({
		values: list(str()).default(FORM_FIELDS.map(() => '')),
		notifications: bool().default(false),
		delivery: str().default('standard'),
		audience: str().default('personal'),
		conditional: bool().default(false),
	}),

	intents: {
		setField: intent({
			description: 'Update one controlled field',
			input: schema({ index: int(), value: str() }),
			run: ({ state, input }: any) => {
				state.values[input.index] = input.value;
				recordValidation(input.value);
			},
		}),
		setNotifications: intent({
			description: 'Toggle the notifications checkbox',
			input: schema({ value: bool() }),
			run: ({ state, input }: any) => {
				state.notifications = input.value;
			},
		}),
		setDelivery: intent({
			description: 'Pick a delivery option',
			input: schema({ delivery: str() }),
			run: ({ state, input }: any) => {
				state.delivery = input.delivery;
			},
		}),
		setAudience: intent({
			description: 'Pick the audience',
			input: schema({ value: str() }),
			run: ({ state, input }: any) => {
				state.audience = input.value;
			},
		}),
		toggleConditional: intent({
			description: 'Toggle the conditional section',
			run: ({ state }: any) => {
				state.conditional = !state.conditional;
			},
		}),
		submit: intent({
			description: 'Submit the stress form',
			// Janux's delegated submit already preventDefault()s and reads the
			// real form; the stats mirror shared.js's recordSubmission, which
			// expects the raw DOM event this intent (by design) never receives.
			run: () => {
				const form = document.getElementById('stress-form') as HTMLFormElement;
				const stats = getRuntimeStress().stats.form;

				stats.submits += 1;
				stats.lastSubmission = Object.fromEntries(new FormData(form) as any);
			},
		}),
		reset: intent({
			description: 'Reset the whole form',
			run: ({ state }: any) => {
				state.values = FORM_FIELDS.map(() => '');
				state.notifications = false;
				state.delivery = 'standard';
				state.audience = 'personal';
				state.conditional = false;
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<form id="stress-form" onSubmit={intents.submit}>
			{FORM_FIELDS.map((index) => {
				markFieldRender(index);

				return (
					<label key={index}>
						<input
							name={`field-${index}`}
							data-field-index={index}
							value={state.values[index]}
							onInput={intents.setField.with({ index })}
						/>
						<output data-field-output={index}>{state.values[index]}</output>
					</label>
				);
			})}
			<label>
				<input
					id="form-checkbox"
					type="checkbox"
					name="notifications"
					value="enabled"
					checked={state.notifications}
					onChange={intents.setNotifications}
				/>
				Notifications
			</label>
			<label>
				<input
					id="form-radio-standard"
					type="radio"
					name="delivery"
					value="standard"
					checked={state.delivery === 'standard'}
					onChange={intents.setDelivery.with({ delivery: 'standard' })}
				/>
				Standard
			</label>
			<label>
				<input
					id="form-radio-express"
					type="radio"
					name="delivery"
					value="express"
					checked={state.delivery === 'express'}
					onChange={intents.setDelivery.with({ delivery: 'express' })}
				/>
				Express
			</label>
			<select id="form-select" name="audience" onChange={intents.setAudience}>
				<option value="personal" selected={state.audience === 'personal'}>
					Personal
				</option>
				<option value="team" selected={state.audience === 'team'}>
					Team
				</option>
			</select>
			<button id="form-conditional-toggle" type="button" onClick={intents.toggleConditional}>
				Toggle conditional section
			</button>
			<div>
				{state.conditional ? (
					<aside id="form-conditional">Conditional validation section</aside>
				) : null}
			</div>
			<button id="form-submit" type="submit">
				Send form
			</button>
			<button id="form-reset" type="button" onClick={intents.reset}>
				Reset form
			</button>
		</form>
	),
});

// ── External store fan-out (512 subscribers) ─────────────────────────────────

// The bridge from the framework-agnostic store into island state: listeners
// coalesce a notification burst into one `sync` intent per microtask (Janux
// state can only move inside a declared run body — RFC §4.4).
let scheduledStoreSync = false;

export const StorePanel = component({
	name: 'stress-store',
	description: '512 external-store subscribers with narrow/broad/rapid writes',

	state: schema({
		visible: bool().default(false),
		values: list(int()).default(STORE_SUBSCRIBERS.map(() => 0)),
	}),

	intents: {
		toggle: intent({
			description: 'Toggle store subscribers',
			run: ({ state }: any) => {
				state.visible = !state.visible;
			},
		}),
		narrow: intent({
			description: 'Write one subscriber',
			run: () => {
				getRuntimeStress().store.writeOne(17, 1);
			},
		}),
		broad: intent({
			description: 'Write all subscribers',
			run: () => {
				getRuntimeStress().store.writeAll(7);
			},
		}),
		rapid: intent({
			description: 'Write rapid updates',
			run: () => {
				const store = getRuntimeStress().store;

				store.writeOne(17, 8);
				store.writeOne(17, 9);
				store.writeOne(17, 10);
			},
		}),
		sync: intent({
			description: 'Pull the external store snapshot into island state',
			run: ({ state }: any) => {
				const store = getRuntimeStress().store;

				state.values = STORE_SUBSCRIBERS.map((index) => store.get(index));
			},
		}),
	},

	effects: {
		// One real subscription per rendered subscriber (the contract the
		// harness audits: 512 subscribe calls, 512 unsubscribe calls, size 0
		// after unmount) — established when the grid mounts, released by the
		// effect's cleanup when it unmounts.
		subscribers: effect({
			when: (state: any) => state.visible,
			run: ({ state, intents }: any) => {
				if (!state.visible) return undefined;
				const store = getRuntimeStress().store;
				const schedule = () => {
					if (scheduledStoreSync) return;
					scheduledStoreSync = true;
					queueMicrotask(() => {
						scheduledStoreSync = false;
						void intents.sync();
					});
				};
				// One DISTINCT listener per subscriber: the store holds them in a
				// Set, so sharing one function would collapse 512 subscriptions
				// into a single entry.
				const unsubscribes = STORE_SUBSCRIBERS.map(() => store.subscribe(() => schedule()));

				// Fresh backends (external-store-integrations swaps them while
				// unmounted) start from zero: align the rendered values now.
				void intents.sync();

				return () => {
					unsubscribes.forEach((unsubscribe) => unsubscribe());
				};
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<section aria-label="External store">
			<button id="store-toggle" type="button" onClick={intents.toggle}>
				Toggle store subscribers
			</button>
			<button id="store-narrow" type="button" onClick={intents.narrow}>
				Write one subscriber
			</button>
			<button id="store-broad" type="button" onClick={intents.broad}>
				Write all subscribers
			</button>
			<button id="store-rapid" type="button" onClick={intents.rapid}>
				Write rapid updates
			</button>
			{state.visible ? (
				<div id="store-subscribers">
					{STORE_SUBSCRIBERS.map((index) => {
						markStoreRender(index);

						return (
							<output data-subscriber-index={index} key={index}>
								{state.values[index]}
							</output>
						);
					})}
				</div>
			) : null}
		</section>
	),
});

// ── Async recovery ────────────────────────────────────────────────────────────

export const AsyncPanel = component({
	name: 'stress-async',
	description: 'Async request lifecycle: reject, retry, cancel and recover',

	state: schema({
		status: str().default('idle'),
		value: str().default(''),
		error: str().default(''),
	}),

	intents: {
		resolve: intent({
			description: 'Start a resolving request',
			run: () => {
				getRuntimeStress().async.run('resolve');
			},
		}),
		reject: intent({
			description: 'Start a rejecting request',
			run: () => {
				getRuntimeStress().async.run('reject');
			},
		}),
		slow: intent({
			description: 'Start a slow request',
			run: () => {
				getRuntimeStress().async.run('slow', 'stale');
			},
		}),
		sync: intent({
			description: 'Pull the async resource snapshot into island state',
			run: ({ state }: any) => {
				const snapshot = getRuntimeStress().async.getSnapshot();

				state.status = snapshot.status;
				state.value = snapshot.value;
				state.error = snapshot.error;
			},
		}),
	},

	effects: {
		resource: effect({
			run: ({ intents }: any) => {
				const unsubscribe = getRuntimeStress().async.subscribe(() => void intents.sync());

				return () => unsubscribe();
			},
		}),
	},

	view: ({ state, intents }: any) => (
		<section aria-label="Async recovery">
			<button id="async-resolve" type="button" onClick={intents.resolve}>
				Resolve request
			</button>
			<button id="async-reject" type="button" onClick={intents.reject}>
				Reject request
			</button>
			<button id="async-slow" type="button" onClick={intents.slow}>
				Start slow request
			</button>
			<output id="async-status">{state.status}</output>
			<output id="async-value">{state.value}</output>
			<output id="async-error">{state.error}</output>
		</section>
	),
});
