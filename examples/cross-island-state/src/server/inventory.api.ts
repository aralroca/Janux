import { api } from '@janux/server';

let checks = 0;

/**
 * A deliberately simple server counter: every call is one "stock check". The
 * Inventory island re-queries it through `refresh: onEvent('cart.itemAdded')`,
 * so the number visibly grows once per cart add — the event crossed islands
 * AND reached the server.
 */
export const checkInventory = api({
  description: 'Check stock levels. Returns how many checks this server has served.',
  run: () => ({ checks: (checks += 1), checkedAt: new Date().toISOString() }),
});
