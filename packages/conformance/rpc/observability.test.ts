import { afterAll, describe } from 'bun:test';
import { setOnError, setPiiFilter, setTracer } from 'janux/observability';
import { runScenarios } from '../support/scenario';
import { OBSERVABILITY_CASES } from './observability.cases';

/**
 * The tracer, the error sink and the PII filter are process-wide, so every row
 * installs its own and removes it again; this restores the defaults once more at
 * the end, so a row that fails mid-way cannot leak a tracer into another file.
 */
setOnError(() => undefined);

afterAll(() => {
  setTracer(undefined);
  setPiiFilter(undefined);
  setOnError(undefined);
});

describe('api() observability', () => runScenarios(OBSERVABILITY_CASES));
