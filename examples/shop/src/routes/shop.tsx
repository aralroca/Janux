import { Cart } from '../components/Cart';
import { Copilot } from '../components/Copilot';
import { Toasts } from '../components/Toasts';

export const meta = {
  title: 'Janux Shop — demo',
  description: 'A cart with two faces: buttons for humans, guarded tools for the copilot.',
};

export default function ShopPage() {
  return (
    <div class="app">
      <header class="topbar">
        <a class="brand" href="/">
          ✦ Janux Shop
        </a>
        <nav>
          <a href="/shop">Shop</a>
          <a href="https://github.com/aralroca/Janux">GitHub</a>
        </nav>
      </header>
      <main class="shop">
        <Cart />
        <Copilot persist />
      </main>
      <Toasts eager />
    </div>
  );
}
