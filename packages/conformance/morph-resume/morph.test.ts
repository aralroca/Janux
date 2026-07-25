import { beforeEach, describe, expect } from 'bun:test';
import { morph } from '../../janux/src/client/morph';
import { resetDocument, useDom } from '../support/dom';
import { runCases, runScenarios } from '../support/scenario';
import { CONTROL_CASES } from './controls.cases';
import { MORPH_CASES } from './morph.cases';

useDom();

describe('morph', () => {
  runCases(MORPH_CASES, (row) => {
    const root = document.createElement('div');
    const target = document.createElement('div');

    root.innerHTML = row.from;
    target.innerHTML = row.to;
    morph(root, [...target.childNodes]);

    expect(root.innerHTML).toBe(row.expected);
  });
});

describe('controlled inputs across a patch', () => {
  beforeEach(resetDocument);
  runScenarios(CONTROL_CASES);
});
