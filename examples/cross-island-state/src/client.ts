import { boot, agentGlow, agentCursor } from 'janux/client';
import { CartBadge } from './components/CartBadge';
import { CartPanel } from './components/CartPanel';
import { Inventory } from './components/Inventory';
import { ProductGrid } from './components/ProductGrid';
import { Toasts } from './components/Toasts';
import { cart } from './stores';

boot({ defs: [cart, CartBadge, CartPanel, Inventory, ProductGrid, Toasts], glow: agentGlow(), cursor: agentCursor() });
