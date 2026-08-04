import { api } from '@janux/server';
import { int, list as listOf, schema, str } from 'janux';
import { catalog as readCatalog, quote as priceFor, ship as sendShipment } from './warehouse';

/**
 * The supplier's whole agent surface: three `api()` functions.
 *
 * Nothing here mentions A2A. The `/.well-known/agent-card.json` this app serves
 * is derived from exactly these three — their names, descriptions, input
 * schemas and guards — so the card an outside agent reads cannot describe an
 * app other than the one that will answer it.
 */

export const catalog = api({
  description: 'What this supplier sells: sku, name, unit price and units in stock. Read this before quoting or ordering.',
  output: schema({ items: listOf({ sku: str(), name: str(), unitPrice: int(), inStock: int() }) }),
  run: () => ({ items: readCatalog() }),
});

export const quote = api({
  description: 'Price a hypothetical order. Reserves nothing and ships nothing.',
  input: schema({ sku: str().min(3).max(3), units: int().min(1).max(500) }),
  output: schema({ sku: str(), units: int(), unitPrice: int(), total: int() }),
  run: ({ input }) => priceFor(input.sku, input.units),
});

/**
 * The one that moves goods, so an agent may ask but not decide: `confirm` turns
 * every agent-origin call — bridge, MCP or A2A alike — into a proposal parked
 * for a human here, at the supplier, whoever the caller was.
 */
export const ship = api({
  description: 'Ship units of a sku from stock. Runs only after a human at this supplier approves the proposal.',
  input: schema({ sku: str().min(3).max(3), units: int().min(1).max(500) }),
  output: schema({ id: int(), sku: str(), units: int(), at: str() }),
  guard: 'confirm',
  run: ({ input }) => sendShipment(input.sku, input.units),
});
