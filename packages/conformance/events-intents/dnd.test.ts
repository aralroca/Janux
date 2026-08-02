import { describe } from 'bun:test';
import { useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { DND_CASES } from './dnd.cases';

useDom();

describe('declarative drag and drop conformance', () => runScenarios(DND_CASES));
