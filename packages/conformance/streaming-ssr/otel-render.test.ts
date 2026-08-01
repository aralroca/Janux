import { afterEach, describe } from 'bun:test';
import { setOnError, setTracer } from 'janux/observability';
import { runScenarios } from '../support/scenario';
import { OTEL_RENDER_CASES } from './otel-render.cases';

// Rows unregister what they registered; this is the net for a row that fails
// halfway and would otherwise trace (or report) the rest of the file.
afterEach(() => {
  setTracer(undefined);
  setOnError(undefined);
});

describe('tracing a streamed page', () => runScenarios(OTEL_RENDER_CASES));
