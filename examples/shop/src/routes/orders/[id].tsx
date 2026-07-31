import { orderStatus } from '../../server/shop.api';

export const meta = ({ params }: { params: { id: string } }) => ({
  title: `Order ${params.id} — Janux Shop`,
});

/** A fully static page (0 KB JS) with a dynamic route param and server data. */
export default async function OrderPage({ params }: { params: { id: string } }) {
  const order: any = await orderStatus({ orderId: params.id });

  return (
    <div class="app">
      {/* The chrome /shop renders, with the wordmark named on both sides: that pairing
          is the whole shared-element contract — the topbar stays put while the page
          underneath cross-fades, instead of blinking out and back in with it. */}
      <header class="topbar">
        <a class="brand" href="/" style={{ viewTransitionName: 'wordmark' }}>
          ✦ Janux Shop
        </a>
        <nav>
          <a href="/shop">Shop</a>
        </nav>
      </header>
      <main class="order-page">
        <h1>Order {order.orderId}</h1>
        <p>
          Status: <strong class="status">{order.status}</strong>
        </p>
        <p>
          <a href="/shop">← Back to the shop</a>
        </p>
      </main>
    </div>
  );
}
