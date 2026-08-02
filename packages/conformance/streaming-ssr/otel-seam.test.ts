import { afterEach, describe } from 'bun:test';
import { setPiiFilter, setTracer } from 'janux/observability';
import { runScenarios } from '../support/scenario';
import { OTEL_SEAM_CASES } from './otel-seam.cases';

// Process-wide registrations: a row that fails halfway must not trace, or
// redact, the rest of the file.
afterEach(() => {
  setTracer(undefined);
  setPiiFilter(undefined);
});

describe('the tracing seam and what an uninstrumented app pays for it', () => runScenarios(OTEL_SEAM_CASES));
