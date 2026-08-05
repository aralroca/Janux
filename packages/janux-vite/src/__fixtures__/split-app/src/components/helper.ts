/** Lives in the intent chunk only: nothing else imports it. */
export function label(note: string): string {
  return `saved:${note}`;
}
