import { schema, str, int, money, enums } from 'janux';

/** Conference tracks — the closed set the select and the schema share. */
export const TRACKS = ['frontend', 'backend', 'ai'];

/**
 * The typed contract, written once: the api endpoint validates against it, the
 * manifest publishes it as the tool's JSON Schema, and the form island runs it
 * client-side for per-field errors. Numbers are real numbers here — the form
 * converts its strings before validating (see components/Registration.tsx).
 */
export const registrationInput = schema({
  name: str().min(2).max(60),
  attendees: int().min(1).max(8),
  donation: money().min(0),
  track: enums(TRACKS),
});

export interface RegistrationInput {
  name: string;
  attendees: number;
  donation: number;
  track: string;
}
