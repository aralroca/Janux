import { api } from '@janux/server';
import { schema, str, int, money, enums, list } from 'janux';
import { registrationInput, TRACKS, type RegistrationInput } from '../schema';

type StoredRegistration = RegistrationInput & { id: string };

/** In-memory persistence: enough to show that a submit really lands somewhere. */
const REGISTRATIONS: StoredRegistration[] = [];

export const register = api({
  description:
    'Register a group for JanuxConf. The typed contract: attendees is a real integer ' +
    'and donation is an amount in cents — strings are rejected, never coerced.',
  input: registrationInput,
  output: schema({ id: str(), spot: int() }),
  run: ({ input }) => {
    const entry: StoredRegistration = { id: `reg_${crypto.randomUUID().slice(0, 8)}`, ...input };

    REGISTRATIONS.push(entry);

    return { id: entry.id, spot: REGISTRATIONS.length };
  },
});

export const listRegistrations = api({
  description: 'List every stored registration with its typed fields.',
  output: schema({
    registrations: list({ id: str(), name: str(), attendees: int(), donation: money(), track: enums(TRACKS) }),
  }),
  run: () => ({ registrations: REGISTRATIONS }),
});
