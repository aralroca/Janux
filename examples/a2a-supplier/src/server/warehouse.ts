/** The supplier's world: a price list, stock, and what has actually left the building. */

export interface Shipment {
  id: number;
  sku: string;
  units: number;
  at: string;
}

const CATALOG = [
  { sku: 'MUG', name: 'Enamel mug', unitPrice: 9 },
  { sku: 'TEE', name: 'Cotton tee', unitPrice: 19 },
  { sku: 'CAP', name: 'Field cap', unitPrice: 14 },
];

const stock = new Map<string, number>([
  ['MUG', 120],
  ['TEE', 40],
  ['CAP', 15],
]);
const shipments: Shipment[] = [];

export const catalog = () => CATALOG.map((item) => ({ ...item, inStock: stock.get(item.sku) ?? 0 }));

export const listShipments = (): Shipment[] => [...shipments].reverse();

function itemOf(sku: string) {
  const item = CATALOG.find((candidate) => candidate.sku === sku);

  if (!item) throw new Error(`Unknown sku "${sku}" — call supplier.catalog first`);

  return item;
}

export function quote(sku: string, units: number) {
  const item = itemOf(sku);

  return { sku, units, unitPrice: item.unitPrice, total: item.unitPrice * units };
}

/** The only call that changes the world — which is why its guard is `confirm`. */
export function ship(sku: string, units: number): Shipment {
  const available = stock.get(itemOf(sku).sku) ?? 0;

  if (units > available) throw new Error(`Only ${available} ${sku} left in stock`);
  stock.set(sku, available - units);
  const shipment = { id: shipments.length + 1, sku, units, at: new Date().toISOString() };

  shipments.push(shipment);

  return shipment;
}
