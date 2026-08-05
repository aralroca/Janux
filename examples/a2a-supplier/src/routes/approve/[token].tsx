import { ApprovalDesk } from '../../components/ApprovalDesk';

export const meta = {
  title: 'Approve a parked call — Supplier',
  description: 'A remote agent proposed a guarded call. A human here decides whether it runs.',
};

/**
 * The proposal token travels as a path segment, so the operator can be sent
 * here by a link and the page needs no query parsing to know which parked call
 * it is settling.
 */
export default function Approve({ params }: { params: Record<string, string> }) {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">📦 Supplier</span>
        <span class="bar-hint">Human approval desk</span>
      </header>
      <main>
        <ApprovalDesk eager initial={{ token: params.token }} />
        <p class="hint">
          <a href="/">Back to the supplier</a> — approved shipments show up in its log.
        </p>
      </main>
    </div>
  );
}
