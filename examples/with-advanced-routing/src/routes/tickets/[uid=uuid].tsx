import { TICKETS } from '../../data/kb';

export const meta = ({ params }: { params: { uid: string } }) => ({
  title: `Ticket ${params.uid} — Janux KB`,
});

/** Only well-formed uuids reach this page: the `uuid` matcher gates the segment. */
export default function TicketByUuid({ params }: { params: { uid: string } }) {
  return (
    <article class="card ticket">
      <p class="eyebrow">Typed matcher</p>
      <h1 class="uuid">Ticket {params.uid}</h1>
      <p class="lead">{TICKETS[params.uid] ?? 'No subject on file.'}</p>
      <p class="matched-by">
        Matched by the <code>uuid</code> matcher.
      </p>
      <p class="note">
        Served by <code>tickets/[uid=uuid].tsx</code> — a partial uuid matches nothing and 404s.
      </p>
    </article>
  );
}
