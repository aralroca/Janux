/**
 * Client-side render keys, off-DOM. `toDomNodes` stamps each element built from
 * a keyed JSX node; `morph` matches children by these keys so a permutation
 * moves the existing nodes instead of rewriting them in place. A WeakMap keeps
 * the serialized HTML byte-identical to SSR output (no `key` attribute) and
 * costs nothing on unkeyed trees.
 */
const nodeKeys = new WeakMap<Node, string | number>();

export function setNodeKey(node: Node, key: string | number): void {
  nodeKeys.set(node, key);
}

export function nodeKey(node: Node): string | number | undefined {
  return node.nodeType === Node.ELEMENT_NODE ? nodeKeys.get(node) : undefined;
}

/**
 * The keyed-adoption invariant both reconcilers share, evaluated AFTER the
 * by-key lookup found no survivor: a keyed slot never adopts a node that
 * carries a different key, and an unkeyed slot must not consume a node whose
 * key the incoming list still claims.
 */
export function claimedElsewhere(
  slotKey: string | number | undefined,
  fromKey: string | number | undefined,
  toKeys: Set<string | number> | null,
): boolean {
  if (fromKey === undefined) return false;
  if (slotKey !== undefined) return true;

  return toKeys !== null && toKeys.has(fromKey);
}
