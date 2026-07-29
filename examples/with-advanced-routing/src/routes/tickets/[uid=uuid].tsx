import { TICKETS } from '../../data/kb';

export const meta = ({ params }: { params: { uid: string } }) => ({
  title: `Ticket ${params.uid} — Janux KB`,
});

/** Only well-formed uuids reach this page: the `uuid` matcher gates the segment. */
export default function TicketByUuid({ params }: { params: { uid: string } }) {
  return (
    <article class="ticket">
      <h1>Ticket {params.uid}</h1>
      <p>{TICKETS[params.uid] ?? 'No subject on file.'}</p>
      <p class="matched-by">
        Matched by the <code>uuid</code> matcher.
      </p>
    </article>
  );
}
