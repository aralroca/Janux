import { describe, expect } from 'bun:test';
import { morph } from '../../janux/src/client/morph';
import { useDom } from '../support/dom';
import { runCases } from '../support/scenario';
import { MORPH_ISLAND_CASES } from './morph-islands.cases';

useDom();

describe('morph: island boundaries', () => {
  runCases(MORPH_ISLAND_CASES, (row) => {
    const root = document.createElement('div');
    const target = document.createElement('div');

    root.innerHTML = row.from;
    target.innerHTML = row.to;
    morph(root, [...target.childNodes]);

    expect(root.innerHTML).toBe(row.expected);
  });
});
