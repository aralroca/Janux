import { bool, enums, int, num, schema, str } from 'janux';

/** Conference tracks — the closed set the select and the schema share. */
export const TRACKS = ['frontend', 'backend', 'ai'];

/**
 * The ONE typed contract, written once: the form intent coerces FormData
 * strings into it (`coerce: 'form'`), the api endpoint validates against it,
 * and the manifest publishes it as the tool's JSON Schema. Numbers are real
 * numbers everywhere — the form never needs a string-typed twin.
 */
export const registrationInput = schema({
  name: str().min(2).max(60),
  attendees: int().min(1).max(8),
  donation: num().min(0),
  newsletter: bool().default(false),
  track: enums(TRACKS),
});

export interface RegistrationInput {
  name: string;
  attendees: number;
  donation: number;
  newsletter: boolean;
  track: string;
}
