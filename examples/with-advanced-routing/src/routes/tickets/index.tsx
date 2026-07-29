import { TICKETS } from '../../data/kb';

export const meta = { title: 'Tickets — Janux KB' };

/** The two typed-matcher pages share this segment; anything unmatched is a 404. */
export default function TicketsPage() {
  return (
    <section class="tickets">
      <h1>Tickets</h1>
      <p>
        Digits go to <code>[id=integer].tsx</code>, uuids to <code>[uid=uuid].tsx</code> — and <code>/tickets/abc</code>
        {' '}matches neither, so it is a 404, not a page that has to validate its own param.
      </p>
      <ul>
        {Object.keys(TICKETS).map((key) => (
          <li key={key}>
            <a href={`/tickets/${key}`}>{key}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
