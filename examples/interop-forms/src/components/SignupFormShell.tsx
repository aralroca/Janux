import { component, enums, intent, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { SignupForm } from './SignupForm';

const PLANS = ['free', 'pro', 'team'];
const FIELDS = ['name', 'email', 'plan'];

const Form = foreign(SignupForm, {
  name: 'signup-form',
  props: (own: any) => ({ draft: own.state.draft }),
  // `handleSubmit` only calls this once zod has validated, so what arrives is
  // already the shape the intent declares — one of the few library callbacks
  // that needs no reshaping at all.
  on: { onSubmitted: 'submit' },
});

/** The wrap-once pattern with an honest seam: react-hook-form owns the inputs, the island owns the draft. */
export const SignupFormShell = component({
  name: 'signup',
  description: 'A signup form. react-hook-form + zod own validation; the draft and the submission are Janux.',
  state: schema({
    draft: obj({ name: str(), email: str(), plan: enums(PLANS) }).default({ name: '', email: '', plan: 'free' }),
    accepted: obj({ name: str(), email: str(), plan: enums(PLANS) }).nullable().default(null),
  }),
  intents: {
    fill: intent({
      description: 'Set one field of the draft',
      input: schema({ field: enums(FIELDS), value: str() }),
      run: ({ state, input }: any) => {
        // A new object, not a field write: the React form is reconciled by
        // identity, so mutating in place would leave it showing stale values.
        state.draft = { ...state.draft, [input.field]: input.value };
      },
    }),
    submit: intent({
      description: 'Submit the form. Needs human approval.',
      // Guarded on purpose: signing someone up is the kind of thing an agent
      // should propose rather than do.
      guard: 'confirm',
      input: schema({ name: str(), email: str(), plan: enums(PLANS) }),
      run: ({ state, input }: any) => (state.accepted = input),
    }),
  },
  view: ({ state }: any) => (
    <section class="signup-shell">
      <Form state={state} />
      <p class="signup-status">
        {state.accepted
          ? `accepted: ${state.accepted.name} <${state.accepted.email}> on ${state.accepted.plan}`
          : `draft: ${state.draft.name || '—'} <${state.draft.email || '—'}> on ${state.draft.plan}`}
      </p>
    </section>
  ),
});
