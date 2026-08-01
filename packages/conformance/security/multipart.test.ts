import { describe, expect } from 'bun:test';
import { spoolMultipart, type SpooledForm } from '@janux/server';
import { runCases } from '../support/scenario';
import { BOUNDARY, MULTIPART_CASES, type MultipartRow } from './multipart.cases';

/**
 * Every row drives the real `spoolMultipart` over a real `ReadableStream`, because
 * the claim is about a *streaming* parser: a body handed over whole exercises none
 * of the state that a body arriving in 1-byte chunks does, and the rows that pin a
 * `chunk` size are the ones that would catch a boundary split across a read.
 *
 * The assertion is one digest string per row — what the parser understood, or the
 * refusal it produced — so a row states its whole outcome instead of a property
 * that happens to hold. Files are compared by `[field, name, type, sniffed, size]`
 * and never by their spool path, which is a fresh UUID per request by design.
 */

/** The bytes, delivered in `chunk`-sized pieces (or all at once when unset). */
function streamOf(body: string, row: MultipartRow): ReadableStream<Uint8Array> {
  const bytes = row.latin1 ? Uint8Array.from(body, (char) => char.charCodeAt(0)) : new TextEncoder().encode(body);
  const size = row.chunk ?? Math.max(bytes.byteLength, 1);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += size) {
        controller.enqueue(bytes.subarray(offset, offset + size));
      }
      controller.close();
    },
  });
}

function requestFor(row: MultipartRow): Request {
  const body = row.body();

  return new Request('http://test/upload', {
    method: 'POST',
    body: streamOf(body, row),
    headers: {
      'content-type': row.contentType ?? `multipart/form-data; boundary=${BOUNDARY}`,
      ...row.headers,
    },
    duplex: 'half',
  } as RequestInit);
}

/** `[field, name, type, sniffed, size]` per file — the spool path is a fresh UUID and says nothing. */
function digest(form: SpooledForm): string {
  const files = form.files.map((file) => [file.field, file.name, file.type, file.sniffed ?? null, file.size]);

  return `fields=${JSON.stringify(form.fields)} files=${JSON.stringify(files)}`;
}

async function outcome(row: MultipartRow): Promise<string> {
  const form = await spoolMultipart(requestFor(row), { maxBytes: row.maxBytes ?? 1024 * 1024 });

  if (form instanceof Response) return `${form.status} ${((await form.json()) as { error: string }).error}`;
  const summary = digest(form);

  await form.cleanup();

  return summary;
}

describe('multipart/form-data framing', () =>
  runCases(MULTIPART_CASES, async (row) => {
    expect(await outcome(row)).toBe(row.expected);
  }));
