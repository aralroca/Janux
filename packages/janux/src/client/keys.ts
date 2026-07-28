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
