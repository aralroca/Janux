import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { SVG_MATHML_TREE_CASES } from './elements-svg-mathml.cases';

describe('svg and mathml tree serialization', () => runTreeCases(SVG_MATHML_TREE_CASES));
