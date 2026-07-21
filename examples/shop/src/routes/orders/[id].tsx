import { orderStatus } from '../../server/shop.api';

export const meta = ({ params }: { params: { id: string } }) => ({
  title: `Order ${params.id} — Janux Shop`,
});

/** A fully static page (0 KB JS) with a dynamic route param and server data. */
export default async function OrderPage({ params }: { params: { id: string } }) {
  const order: any = await orderStatus({ orderId: params.id });

  return (
    <main class="order-page">
      <h1>Order {order.orderId}</h1>
      <p>
        Status: <strong class="status">{order.status}</strong>
      </p>
      <p>
        <a href="/shop">← Back to the shop</a>
      </p>
    </main>
  );
}
