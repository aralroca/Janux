/**
 * Heading ids and the table of contents, in one pass over the compiled tree.
 *
 * A rehype plugin rather than a second parse of the markdown: the ids that end
 * up in the HTML and the ids the TOC links to are then the same strings by
 * construction, so an anchor cannot point at a heading that renders differently.
 */

export interface Heading {
  depth: number;
  id: string;
  text: string;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const HEADING = /^h([1-6])$/;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** The heading's visible text: element children flattened, raw HTML and code included. */
function textOf(node: HastNode): string {
  if (node.type === 'text' || node.type === 'raw') return node.value ?? '';

  return (node.children ?? []).map(textOf).join('');
}

function walk(node: HastNode, visit: (node: HastNode) => void): void {
  visit(node);
  (node.children ?? []).forEach((child) => walk(child, visit));
}

/** rehype plugin: stamps an id on every heading and appends it to `headings`. */
export function collectHeadings(headings: Heading[]) {
  return () => (tree: HastNode): void => {
    walk(tree, (node) => {
      const depth = node.tagName && HEADING.exec(node.tagName)?.[1];

      if (node.type !== 'element' || !depth) return;
      const text = textOf(node).trim();
      const properties = (node.properties ??= {});
      const id = typeof properties.id === 'string' ? properties.id : slugify(text);

      properties.id = id;
      headings.push({ depth: Number(depth), id, text });
    });
  };
}
