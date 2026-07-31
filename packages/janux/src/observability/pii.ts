import type { SpanAttributes } from './tracing';

/**
 * Span attributes leave the process. Route paths carry ids, error messages
 * quote the input that broke, and an exporter ships all of it to a third party
 * — so every string attribute is scrubbed on the way out, by default, and an
 * app opts into more (or less) with `setPiiFilter`.
 *
 * Deliberately conservative, following the `PiiFilter` already in production in
 * Didit: destroying signal costs debuggability, so bare digit runs (ids,
 * timestamps, amounts) stay.
 *
 * - emails → `[email]`
 * - phone numbers ONLY in international format (leading `+`) → `[phone]`
 * - `data:` URLs and long base64 runs → a length marker; they are payload
 *   bytes, not signal, and would dominate span size.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Space only (never a newline — "+3\n412 items" is not a phone) and a boundary
// so a "+digits" run inside a base64 token or a URL is not spliced.
const PHONE_RE = /(?<![A-Za-z0-9+/=])\+\d[\d ().-]{7,17}\d/g;
const DATA_URL_RE = /data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;
const BASE64_RUN_RE = /[A-Za-z0-9+/]{510,}={0,2}/g;

export type PiiFilter = (value: string) => string;

/** The filter applied to every string attribute unless the app replaces it. */
export const defaultPiiFilter: PiiFilter = (value) =>
  value
    .replace(DATA_URL_RE, (match) => `[data-url truncated, ${match.length} chars]`)
    .replace(BASE64_RUN_RE, (match) => `[base64 truncated, ${match.length} chars]`)
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]');

let filter: PiiFilter = defaultPiiFilter;

/** Replaces the default redaction. Passing `undefined` restores it. */
export function setPiiFilter(next: PiiFilter | undefined): void {
  filter = next ?? defaultPiiFilter;
}

/**
 * Fails CLOSED, unlike everything else here: a filter that throws must not let
 * the raw value through, because the raw value is the thing being protected.
 */
function redact(value: string): string {
  try {
    return filter(value);
  } catch {
    return '[redacted: pii filter failed]';
  }
}

/** Scrubs every string value of a span's attributes; numbers and booleans pass through. */
export function scrubAttributes(attributes: SpanAttributes): SpanAttributes {
  const entries = Object.entries(attributes).map(([key, value]) =>
    typeof value === 'string' ? [key, redact(value)] : [key, value],
  );

  return Object.fromEntries(entries);
}
