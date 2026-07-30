// Ported from Brisa's `translate-core/format-elements` (MIT — Copyright (c) 2024
// Brisa), itself the lineage of next-translate. See CREDITS.md.
import type { TranslationElement } from './types';

export const tagParsingRegex = /<(\w+) *>(.*?)<\/\1 *>|<(\w+) *\/>/;

const NEWLINES = /(?:\r\n|\r|\n)/g;

type Part = string | undefined;

function getElements(parts: Part[]): Part[][] {
  if (!parts.length) return [];
  const [paired, children, unpaired, after] = parts.slice(0, 4);

  return [[paired || unpaired, children || '', after], ...getElements(parts.slice(4))];
}

function withChildren(node: TranslationElement, children: unknown): TranslationElement {
  return { ...node, $p: { ...node.$p, children } };
}

/**
 * Replaces `<0>…</0>` / `<tag>…</tag>` markers in a translated string with the
 * given JSX elements (ported from Brisa). Unmatched tags render only their
 * content, so a missing element never leaks markup into the page.
 */
export function formatElements(
  value: string,
  elements: TranslationElement[] | Record<string, TranslationElement> = [],
): string | unknown[] {
  const parts = value.replace(NEWLINES, '').split(tagParsingRegex);

  if (parts.length === 1) return value;

  const before = parts.shift();
  const tree: unknown[] = before ? [before] : [];

  getElements(parts).forEach(([key, children, after]) => {
    const source = (elements as Record<string, TranslationElement>)[key!];
    const inner = children ? formatElements(children, elements) : children;

    if (source) tree.push(withChildren(source, inner));
    else if (inner) tree.push(inner);
    if (after) tree.push(after);
  });

  return tree;
}
