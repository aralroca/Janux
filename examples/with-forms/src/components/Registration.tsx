import { component, enums, int, intent, list, schema, str, validate } from 'janux';
import { register } from '../server/registrations.api';
import { registrationInput, TRACKS, type RegistrationInput } from '../schema';

/** What the form actually sends: every control arrives as a string, uncoerced. */
const formFields = schema({ name: str(), attendees: str(), donation: str(), track: str() });

/** `''` and non-numeric text become NaN, which `int()`/`money()` reject with a field error. */
function asNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

/** FormData strings → the typed candidate the shared schema validates. */
function toCandidate(input: Record<string, string>): object {
  return {
    name: input.name!.trim(),
    attendees: asNumber(input.attendees!),
    donation: Math.round(asNumber(input.donation!) * 100), // euros in the input, cents in the contract
    track: input.track,
  };
}

function errorOn(state: any, path: string): string {
  const found = state.errors.find((error: any) => error.path === path);

  return found ? found.message : '';
}

function fieldError(state: any, path: string) {
  const message = errorOn(state, path);

  return message ? (
    <p class="error" data-field={path}>
      {message}
    </p>
  ) : null;
}

export const Registration = component({
  name: 'registration',
  description: 'JanuxConf registration form — schema-validated fields with per-field errors.',

  state: schema({
    status: enums(['idle', 'invalid', 'registered']).default('idle'),
    errors: list({ path: str(), message: str() }),
    ticketId: str().nullable(),
    spot: int().default(0),
  }),

  intents: {
    submit: intent({
      description:
        'Submit the registration form. Fields arrive exactly as the form sends them — strings. ' +
        'For a typed contract, call the api.registrations.register tool instead.',
      input: formFields,
      run: async ({ state, input }) => {
        const checked = validate(registrationInput, toCandidate(input));

        if (!checked.ok) {
          state.errors = checked.errors;
          state.status = 'invalid';

          return;
        }
        const ticket = (await register(checked.value as RegistrationInput)) as { id: string; spot: number };

        state.errors = [];
        state.status = 'registered';
        state.ticketId = ticket.id;
        state.spot = ticket.spot;
      },
    }),
  },

  view: ({ state, intents }) => (
    <form class="card" onSubmit={intents.submit}>
      <h1>JanuxConf registration</h1>
      <p class="hint">One schema validates this form, the endpoint and the agent tool.</p>

      <label>
        Full name
        <input name="name" placeholder="Ada Lovelace" />
      </label>
      {fieldError(state, 'name')}

      <label>
        Seats
        <input name="attendees" type="number" placeholder="1" />
      </label>
      {fieldError(state, 'attendees')}

      <label>
        Donation (€)
        <input name="donation" type="number" step="0.01" placeholder="0" />
      </label>
      {fieldError(state, 'donation')}

      <label>
        Track
        <select name="track">
          {TRACKS.map((track) => (
            <option value={track}>{track}</option>
          ))}
        </select>
      </label>
      {fieldError(state, 'track')}

      <button type="submit">Register</button>

      {state.status === 'registered' ? (
        <p class="ok">
          Registered — ticket {state.ticketId}, spot #{state.spot}
        </p>
      ) : null}
    </form>
  ),
});
