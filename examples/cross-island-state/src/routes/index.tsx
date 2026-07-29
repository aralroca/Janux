import { CartBadge } from '../components/CartBadge';
import { CartPanel } from '../components/CartPanel';
import { Inventory } from '../components/Inventory';
import { ProductGrid } from '../components/ProductGrid';
import { Toasts } from '../components/Toasts';

export const meta = {
  title: 'Janux — cross-island state',
  description: 'One cart store shared by five islands: grid, badge, panel, toasts and inventory.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">✦ Cross-island state</span>
        <CartBadge eager />
      </header>
      <main class="split">
        <ProductGrid />
        <div class="side">
          <CartPanel eager />
          <Inventory eager />
        </div>
      </main>
      <Toasts eager />
    </div>
  );
}
