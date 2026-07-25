import { component, intent, list, obj, schema, str } from 'janux';

const USERS = [
  { name: 'Aral Roca', country: 'Spain', status: 'Active' },
  { name: 'Jane Doe', country: 'USA', status: 'Pending' },
  { name: 'Kenji Tanaka', country: 'Japan', status: 'Active' },
];

const matches = (query: string) =>
  USERS.filter((user) => user.name.toLowerCase().includes(query.toLowerCase()));

export const Users = component({
  name: 'users',
  description: 'The users table.',
  state: schema({
    query: str().default(''),
    people: list(obj({ name: str(), country: str(), status: str() })).default(USERS),
  }),
  derived: { rows: (state: any) => matches(state.query) },
  intents: {
    search: intent({
      description: 'Filter the users table by a name query.',
      input: schema({ value: str() }),
      run: ({ state, input }: any) => (state.query = input.value),
    }),
  },
  view: ({ state, derived, intents }: any) => (
    <div class="users">
      <div class="field">
        <label for="user-search">Search users</label>
        <input id="user-search" placeholder="Filter by name…" value={state.query} onInput={intents.search} />
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Country</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {derived.rows.map((user: any) => (
            <tr key={user.name}>
              <td>{user.name}</td>
              <td>{user.country}</td>
              <td>{user.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});
