import { describe, expect } from 'bun:test';
import { setNodeKey } from '../../janux/src/client/keys';
import { morph } from '../../janux/src/client/morph';
import { useDom } from '../support/dom';
import { runCases } from '../support/scenario';
import { MORPH_KEYED_CASES, type KeyedCase } from './morph-keyed.cases';

useDom();

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Builds one child per spec entry and stamps its render key, like `toDomNodes` would. */
function build(spec: KeyedCase['from']): Element {
  const holder = document.createElement('div');

  spec.forEach(([key, html]) => {
    const slot = document.createElement('div');

    slot.innerHTML = html;
    const node = slot.firstChild!;

    if (key !== null && node.nodeType === Node.ELEMENT_NODE) setNodeKey(node, key);
    holder.appendChild(node);
  });

  return holder;
}

describe('morph: keyed children', () => {
  runCases(MORPH_KEYED_CASES, (row) => {
    const root = build(row.from);
    const target = build(row.to);
    const letterOf = new Map([...root.childNodes].map((node, index) => [node, LETTERS[index]!]));

    morph(root, [...target.childNodes]);

    const identity = [...root.childNodes].map((node) => letterOf.get(node) ?? '+').join('');

    expect(`${root.innerHTML} ${identity}`).toBe(`${row.expected} ${row.identity}`);
  });
});
