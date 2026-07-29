import { TICKETS } from '../../data/kb';

export const meta = ({ params }: { params: { id: string } }) => ({
  title: `Ticket #${params.id} — Janux KB`,
});

/** Only digits reach this page: the `integer` matcher gates the segment. */
export default function TicketByNumber({ params }: { params: { id: string } }) {
  return (
    <article class="card ticket">
      <p class="eyebrow">Typed matcher</p>
      <h1>Ticket #{params.id}</h1>
      <p class="lead">{TICKETS[params.id] ?? 'No subject on file.'}</p>
      <p class="matched-by">
        Matched by the <code>integer</code> matcher.
      </p>
      <p class="note">
        Served by <code>tickets/[id=integer].tsx</code> — a uuid in the same segment goes to its sibling instead.
      </p>
    </article>
  );
}
