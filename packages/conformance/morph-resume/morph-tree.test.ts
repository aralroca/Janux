import { describe, expect } from 'bun:test';
import { morph } from '../../janux/src/client/morph';
import { useDom } from '../support/dom';
import { runCases } from '../support/scenario';
import { MORPH_TREE_CASES } from './morph-tree.cases';

useDom();

describe('morph: structure', () => {
  runCases(MORPH_TREE_CASES, (row) => {
    const root = document.createElement('div');
    const target = document.createElement('div');

    root.innerHTML = row.from;
    target.innerHTML = row.to;
    morph(root, [...target.childNodes]);

    expect(root.innerHTML).toBe(row.expected);
  });
});
