import { component, enums, intent, schema, str } from 'janux';

const ROLES = ['Viewer', 'Editor', 'Admin'];

export const Team = component({
  name: 'team',
  description: 'Team invitations.',
  state: schema({
    email: str().default(''),
    role: enums(ROLES).default('Viewer'),
    toast: str().default(''),
  }),
  intents: {
    setEmail: intent({
      description: 'Type into the invite email field.',
      input: schema({ value: str() }),
      run: ({ state, input }: any) => (state.email = input.value),
    }),
    setRole: intent({
      description: 'Pick the role for the invitation.',
      input: schema({ value: enums(ROLES) }),
      run: ({ state, input }: any) => (state.role = input.value),
    }),
    /**
     * One intent, two faces: a human clicks "Send invite" and it uses what is in
     * the fields; an agent passes the email and role straight in. Same audit
     * trail, same code path — and `guard: 'confirm'` here is all it takes to make
     * every agent invitation a proposal a human approves on the real UI.
     */
    invite: intent({
      description: 'Invite a teammate by email with a role (Viewer, Editor, Admin).',
      input: schema({ email: str().optional(), role: enums(ROLES).optional() }),
      run: ({ state, input }: any) => {
        if (input.email) state.email = input.email;
        if (input.role) state.role = input.role;
        state.toast = state.email ? `Invited ${state.email} as ${state.role}.` : 'Enter an email first.';
      },
    }),
  },
  view: ({ state, intents }: any) => (
    <div class="field">
      <label for="invite-email">Invite a teammate</label>
      <input
        id="invite-email"
        type="email"
        placeholder="name@company.com"
        value={state.email}
        onInput={intents.setEmail}
      />
      <label for="invite-role">Role</label>
      <select id="invite-role" value={state.role} onChange={intents.setRole}>
        {ROLES.map((role) => (
          <option key={role} value={role} selected={state.role === role}>
            {role}
          </option>
        ))}
      </select>
      <button class="primary" id="invite-send" on={intents.invite}>
        Send invite
      </button>
      {state.toast ? <div class="toast">{state.toast}</div> : null}
    </div>
  ),
});
