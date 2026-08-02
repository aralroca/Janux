import { afterAll, describe } from 'bun:test';
import { setOnError } from 'janux/observability';
import { runScenarios } from '../support/scenario';
import { INVOCATION_CASES } from './invocation.cases';

/**
 * A tool that really throws reaches `onError` by design — the rows here throw on
 * purpose, so the handler is silenced rather than left to print a stack for every
 * deliberate failure. What each row asserts is its own log, not the console.
 */
setOnError(() => undefined);
// Global state: restored so the silencing does not outlive this file.
afterAll(() => setOnError(undefined));

describe('api() invocation contract', () => runScenarios(INVOCATION_CASES));
