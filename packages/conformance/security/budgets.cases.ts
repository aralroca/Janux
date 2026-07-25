import { acceptAttachments, type AttachmentError } from '@janux/agent';
import { every } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Two budgets that did not bound what they claimed to.
 *
 * `acceptAttachments` counted an `s3://` marker as zero bytes — correct for the
 * *payload*, since the blob lives in storage, but the marker string is still in the
 * request body. So four 50MB markers sailed past a 1KB `maxRequestBytes`: accounted
 * 0, actually 209MB.
 *
 * `every()` accepted `'0ms'`, and `sources.ts` feeds it straight to `setInterval`.
 * A zero-millisecond refresh is an unbounded request flood from every client that
 * mounts the island — and `every('0s')` is a very reachable way to write "no delay".
 */

const png = (data: string) => ({ name: 'f.png', mediaType: 'image/png', data });
const marker = (chars: number) => png(`s3://bucket/${'x'.repeat(chars)}`);
/** ~1KB of base64. */
const payload = (bytes: number) => png('A'.repeat(Math.ceil((bytes * 4) / 3)));

const code = (error: unknown) => (error as AttachmentError).code;

export const BUDGET_CASES: ScenarioCase[] = [
  // ── attachment request accounting ───────────────────────────────────────────
  {
    id: 'budget-a-marker-cannot-pad-past-the-request-limit',
    src: 'janux',
    run: (log) => {
      try {
        acceptAttachments([marker(4000), marker(4000)], { maxRequestBytes: 1024 });
        log.push('accepted');
      } catch (error) {
        log.push(code(error));
      }
    },
    expected: ['too_big'],
  },
  {
    id: 'budget-many-markers-cannot-pad-past-the-request-limit',
    src: 'janux',
    run: (log) => {
      try {
        acceptAttachments([marker(600), marker(600)], { maxRequestBytes: 1000 });
        log.push('accepted');
      } catch (error) {
        log.push(code(error));
      }
    },
    expected: ['request_too_big'],
  },
  {
    id: 'budget-a-short-marker-is-still-accepted',
    src: 'janux',
    run: (log) => {
      log.push(String(acceptAttachments([marker(20)], { maxRequestBytes: 1024 }).length));
    },
    expected: ['1'],
  },
  {
    id: 'budget-a-marker-reports-zero-payload-bytes',
    src: 'janux',
    run: (log) => {
      log.push(String(acceptAttachments([marker(20)])[0]!.bytes));
    },
    expected: ['0'],
  },
  {
    id: 'budget-a-real-file-at-the-per-file-limit-is-accepted',
    src: 'janux',
    run: (log) => {
      log.push(String(acceptAttachments([payload(1000)], { maxFileBytes: 1024, maxRequestBytes: 4096 }).length));
    },
    expected: ['1'],
  },
  {
    id: 'budget-a-real-file-over-the-per-file-limit-is-refused',
    src: 'janux',
    run: (log) => {
      try {
        acceptAttachments([payload(2000)], { maxFileBytes: 1024 });
        log.push('accepted');
      } catch (error) {
        log.push(code(error));
      }
    },
    expected: ['too_big'],
  },
  {
    id: 'budget-refs-are-assigned-in-order',
    src: 'janux',
    run: (log) => {
      log.push(acceptAttachments([marker(10), marker(10)]).map((a) => a.ref).join(','));
    },
    expected: ['att_1,att_2'],
  },
  {
    id: 'budget-too-many-files-is-refused-before-any-sizing',
    src: 'janux',
    run: (log) => {
      try {
        acceptAttachments(Array.from({ length: 5 }, () => marker(10)), { maxFiles: 4 });
        log.push('accepted');
      } catch (error) {
        log.push(code(error));
      }
    },
    expected: ['too_many'],
  },
  {
    id: 'budget-a-disallowed-media-type-is-refused',
    src: 'janux',
    run: (log) => {
      try {
        acceptAttachments([{ name: 'x.exe', mediaType: 'application/x-msdownload', data: 'AAAA' }]);
        log.push('accepted');
      } catch (error) {
        log.push(code(error));
      }
    },
    expected: ['bad_type'],
  },

  // ── refresh intervals ───────────────────────────────────────────────────────
  {
    id: 'budget-a-zero-millisecond-refresh-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'every', () => every('0ms')),
    expected: ['every:threw:Janux: refresh interval "0ms" must be greater than zero'],
  },
  {
    id: 'budget-a-zero-second-refresh-is-refused',
    src: 'janux',
    run: (log) => attempt(log, 'every', () => every('0s')),
    expected: ['every:threw:Janux: refresh interval "0s" must be greater than zero'],
  },
  {
    // Allowed on purpose: the platform clamps a sub-millisecond interval, and
    // refusing it would be arbitrary when `1ms` is accepted. Zero is the only
    // value that is unambiguously a mistake rather than an aggressive choice.
    id: 'budget-a-sub-millisecond-refresh-is-allowed-because-the-platform-clamps-it',
    src: 'janux',
    run: (log) => attempt(log, 'every', () => every('0.0001ms')),
    expected: ['every:ok'],
  },
  {
    id: 'budget-a-one-millisecond-refresh-is-allowed',
    src: 'janux',
    run: (log) => attempt(log, 'every', () => every('1ms')),
    expected: ['every:ok'],
  },
  {
    id: 'budget-an-ordinary-refresh-interval-is-allowed',
    src: 'janux',
    run: (log) => attempt(log, 'every', () => every('30s')),
    expected: ['every:ok'],
  },
  {
    id: 'budget-a-malformed-duration-still-reports-the-parse-error',
    src: 'janux',
    run: (log) => attempt(log, 'every', () => every('soon')),
    expected: ['every:threw:Janux: invalid duration "soon" (use e.g. 300ms, 2s, 5m, 1h)'],
  },
];
