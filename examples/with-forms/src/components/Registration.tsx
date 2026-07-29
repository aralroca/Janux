import { component, enums, int, intent, schema, str } from 'janux';
import { register } from '../server/registrations.api';
import { registrationInput, TRACKS } from '../schema';

export const Registration = component({
  name: 'registration',
  description: 'JanuxConf registration form — one typed schema serves the form, the api and the agent tool.',

  state: schema({
    status: enums(['idle', 'registered']).default('idle'),
    ticketId: str().nullable(),
    spot: int().default(0),
  }),

  intents: {
    submit: intent({
      description:
        'Register a group for JanuxConf. The typed contract: attendees is a real integer, ' +
        'donation a number in euros — the strings a form submits are coerced before validation.',
      input: registrationInput,
      coerce: 'form',
      run: async ({ state, input }) => {
        const ticket = (await register(input)) as { id: string; spot: number };

        state.status = 'registered';
        state.ticketId = ticket.id;
        state.spot = ticket.spot;
      },
    }),
  },

  view: ({ state, intents }) => (
    <form class="card" onSubmit={intents.submit}>
      <h1>JanuxConf registration</h1>
      <p class="hint">One typed schema drives this form, the endpoint and the agent tool.</p>

      <label>
        Full name
        <input name="name" placeholder="Ada Lovelace" required minLength={2} maxLength={60} />
      </label>

      <label>
        Seats
        <input name="attendees" type="number" placeholder="1" required min={1} max={8} />
      </label>

      <label>
        Donation (€)
        <input name="donation" type="number" step="0.01" placeholder="0" required min={0} />
      </label>

      <label>
        Track
        <select name="track">
          {TRACKS.map((track) => (
            <option value={track}>{track}</option>
          ))}
        </select>
      </label>

      <label class="check">
        <input name="newsletter" type="checkbox" />
        Email me about next year&apos;s edition
      </label>

      <button type="submit">Register</button>

      {state.status === 'registered' ? (
        <p class="ok">
          Registered — ticket {state.ticketId}, spot #{state.spot}
        </p>
      ) : null}
    </form>
  ),
});
