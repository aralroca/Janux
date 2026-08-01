import { afterEach, describe } from 'bun:test';
import { setOnError } from 'janux/observability';
import { runScenarios } from '../support/scenario';
import { DOCUMENT_CASES } from './document.cases';

// A row that registers an error sink unregisters it itself; this is the net for
// a row that fails halfway and would otherwise leak it into the next one.
afterEach(() => setOnError(undefined));

describe('the streamed document, from the head to the last boundary', () => runScenarios(DOCUMENT_CASES));
