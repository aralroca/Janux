import type { JanuxSpan, JanuxTracer, SpanAttributes } from '../tracing';

export interface RecordedSpan {
  name: string;
  attributes: SpanAttributes;
  errors: unknown[];
  /** Index of the parent in the same list, or -1 for a root span. */
  parent: number;
  ended: boolean;
}

export interface RecordingTracer extends JanuxTracer {
  spans: RecordedSpan[];
  /** `name` of every span, in start order — what the trace assertions read. */
  names(): string[];
}

/**
 * The in-memory tracer every observability test asserts against. Nesting is
 * tracked the way a real tracer tracks it (a stack of active spans), so a test
 * can assert the shape of a trace and not just its span names.
 */
export function recordingTracer(): RecordingTracer {
  const spans: RecordedSpan[] = [];
  const stack: number[] = [];

  const span = async <T>(name: string, attributes: SpanAttributes, run: (span: JanuxSpan) => Promise<T>): Promise<T> => {
    const index = spans.length;
    const record: RecordedSpan = { name, attributes: { ...attributes }, errors: [], parent: stack.at(-1) ?? -1, ended: false };
    const handle: JanuxSpan = {
      setAttributes: (extra) => Object.assign(record.attributes, extra),
      recordError: (error) => record.errors.push(error),
    };

    spans.push(record);
    stack.push(index);
    try {
      return await run(handle);
    } finally {
      stack.pop();
      record.ended = true;
    }
  };

  return { spans, span, names: () => spans.map((entry) => entry.name) };
}
