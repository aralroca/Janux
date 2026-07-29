import { TICKETS } from '../../data/kb';

export const meta = ({ params }: { params: { id: string } }) => ({
  title: `Ticket #${params.id} — Janux KB`,
});

/** Only digits reach this page: the `integer` matcher gates the segment. */
export default function TicketByNumber({ params }: { params: { id: string } }) {
  return (
    <article class="ticket">
      <h1>Ticket #{params.id}</h1>
      <p>{TICKETS[params.id] ?? 'No subject on file.'}</p>
      <p class="matched-by">
        Matched by the <code>integer</code> matcher.
      </p>
    </article>
  );
}
