import { TICKETS } from '../../data/kb';

export const meta = { title: 'Tickets — Janux KB' };

/** Digits and uuids share one segment, so the label says which page answers. */
const matcherOf = (key: string) => (/^\d+$/.test(key) ? 'integer' : 'uuid');

/** The two typed-matcher pages share this segment; anything unmatched is a 404. */
export default function TicketsPage() {
  return (
    <section class="tickets">
      <header class="page-head">
        <p class="eyebrow">Typed matchers</p>
        <h1>Tickets</h1>
        <p class="lead">
          Digits go to <code>[id=integer].tsx</code>, uuids to <code>[uid=uuid].tsx</code> — and{' '}
          <code>/tickets/abc</code> matches neither, so it is a 404, not a page that has to validate its own param.
        </p>
      </header>
      <ul class="ticket-list">
        {Object.entries(TICKETS).map(([key, subject]) => (
          <li class="ticket-row" key={key}>
            <a class="ticket-id" href={`/tickets/${key}`}>
              {key}
            </a>
            <span class="badge">{matcherOf(key)}</span>
            <p class="ticket-subject">{subject}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
