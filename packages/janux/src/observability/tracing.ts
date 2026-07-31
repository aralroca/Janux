import { reportWarning } from './errors';
import { scrubAttributes } from './pii';

export type AttributeValue = string | number | boolean;
export type SpanAttributes = Record<string, AttributeValue | undefined>;

export interface JanuxSpan {
  setAttributes(attributes: SpanAttributes): void;
  recordError(error: unknown): void;
}

export interface JanuxTracer {
  /**
   * Runs `run` inside a span named `name`. Parenting is the tracer's job — an
   * OTel tracer maps this straight onto `startActiveSpan`, which is why the
   * seam is callback-shaped rather than start/end.
   */
  span<T>(name: string, attributes: SpanAttributes, run: (span: JanuxSpan) => Promise<T>): Promise<T>;
}

const NOOP_SPAN: JanuxSpan = { setAttributes: () => undefined, recordError: () => undefined };

let tracer: JanuxTracer | undefined;
let degraded = false;

/** Registers the process-wide tracer — what `instrumentation.ts` calls. `undefined` turns tracing off. */
export function setTracer(next: JanuxTracer | undefined): void {
  tracer = next;
  degraded = false;
}

export function isTracing(): boolean {
  return tracer !== undefined;
}

/** Said once per tracer: a broken exporter that logged per span would be its own outage. */
function degrade(error: unknown): void {
  if (degraded) return;
  degraded = true;
  reportWarning(`tracing is degraded — the registered tracer threw: ${error}`, { phase: 'observability' });
}

function shield(call: () => void): void {
  try {
    call();
  } catch (error) {
    degrade(error);
  }
}

/** The span handle app-facing code sees: scrubbed on the way in, incapable of throwing on the way out. */
function shielded(span: JanuxSpan): JanuxSpan {
  return {
    setAttributes: (attributes) => shield(() => span.setAttributes(scrubAttributes(attributes))),
    recordError: (error) => shield(() => span.recordError(error)),
  };
}

function safeAttributes(attributes: () => SpanAttributes): SpanAttributes {
  try {
    return scrubAttributes(attributes());
  } catch (error) {
    degrade(error);

    return {};
  }
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function unwrap<T>(outcome: Outcome<T>): T {
  if (outcome.ok) return outcome.value;

  throw outcome.error;
}

/**
 * The work's outcome is captured before it can be confused with the tracer's.
 * Without this, an exporter that throws while flushing turned a page that had
 * already rendered into a 500 — the exact opposite of fail-open.
 */
async function traced<T>(
  active: JanuxTracer,
  name: string,
  attributes: () => SpanAttributes,
  run: (span: JanuxSpan) => Promise<T>,
): Promise<T> {
  let outcome: Outcome<T> | undefined;
  const record = async (span: JanuxSpan): Promise<T> => {
    const handle = shielded(span);

    outcome = await run(handle).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    if (!outcome.ok) handle.recordError(outcome.error);

    return unwrap(outcome);
  };

  try {
    return await active.span(name, safeAttributes(attributes), record);
  } catch (error) {
    if (outcome) return unwrap(outcome);
    degrade(error);

    return run(NOOP_SPAN);
  }
}

/**
 * Runs `run` inside a span — or just runs it, when no `instrumentation.ts`
 * registered a tracer. The off-state is the common one, so it costs a single
 * branch: `attributes` is a thunk precisely so an uninstrumented app never
 * builds an object it would throw away.
 */
export function withSpan<T>(
  name: string,
  attributes: () => SpanAttributes,
  run: (span: JanuxSpan) => Promise<T>,
): Promise<T> {
  const active = tracer;

  if (!active) return run(NOOP_SPAN);

  return traced(active, name, attributes, run);
}
