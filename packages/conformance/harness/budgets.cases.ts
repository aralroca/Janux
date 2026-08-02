import {
  acceptAttachments,
  AttachmentError,
  approxTokens,
  createMemoryCounterStore,
  createRateLimiter,
  historyTokenBudget,
  runProcessors,
  type AttachmentPolicy,
  type IncomingAttachment,
  type TurnContext,
} from '@janux/agent';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The budgets a turn has to fit inside: what a caller may upload, how much
 * history reaches the model, and how often one identity may ask at all.
 *
 * Every one of these is a bound on *untrusted* input, so the rows that matter
 * are the ones at and just past the edge — the file that is exactly the limit,
 * the storage marker that carries no bytes but plenty of string, the message
 * that alone exceeds the whole budget — and the shape of the refusal, because
 * an operator branches on the code.
 */

const msg = (role: string, content: unknown) => ({ role, content }) as TurnContext['messages'][number];
const turnOf = (...messages: TurnContext['messages']): TurnContext => ({ messages });
const roles = (turn: TurnContext) => turn.messages.map((message) => message.role).join(',');
const texts = (turn: TurnContext) => turn.messages.map((message) => String(message.content)).join('|');

/** `n` bytes of base64 payload (4 characters carry 3 bytes). */
const payload = (bytes: number) => 'A'.repeat(Math.ceil(bytes / 3) * 4);

const file = (extra: Partial<IncomingAttachment> = {}): IncomingAttachment => ({
  name: 'scan.png',
  mediaType: 'image/png',
  data: payload(9),
  ...extra,
});

const accept = (files: IncomingAttachment[], policy?: AttachmentPolicy) => acceptAttachments(files, policy);

const budget = (max: number, ...messages: TurnContext['messages']) => runProcessors([historyTokenBudget(max)], turnOf(...messages));

function limiter(config: { limit: number; windowMs: number; globalLimit?: number }) {
  let now = 0;
  const store = createMemoryCounterStore(() => now);

  return { limiter: createRateLimiter({ ...config, store }), tick: (ms: number) => (now += ms) };
}

const verdicts = async (allow: (id: string) => Promise<boolean>, id: string, times: number): Promise<string> => {
  const results: string[] = [];

  for (let index = 0; index < times; index += 1) results.push((await allow(id)) ? 'y' : 'n');

  return results.join('');
};

export const BUDGET_CASES: ScenarioCase[] = [
  // ── attachments ─────────────────────────────────────────────────────────────
  {
    id: 'harness2-attachments-are-numbered-so-the-model-can-cite-them',
    src: 'janux',
    run: (log) => log.push(accept([file(), file(), file()]).map((entry) => entry.ref).join(',')),
    expected: ['att_1,att_2,att_3'],
  },
  {
    id: 'harness2-an-attachment-keeps-the-name-and-type-it-arrived-with',
    src: 'janux',
    run: (log) => {
      const [accepted] = accept([file({ name: 'passport.pdf', mediaType: 'application/pdf' })]);

      log.push(`${accepted!.name} ${accepted!.mediaType}`);
    },
    expected: ['passport.pdf application/pdf'],
  },
  {
    id: 'harness2-an-attachments-size-is-measured-from-its-payload',
    src: 'janux',
    run: (log) => log.push(String(accept([file({ data: payload(9) })])[0]!.bytes)),
    expected: ['9'],
  },
  {
    id: 'harness2-base64-padding-is-not-counted-as-bytes',
    src: 'janux',
    run: (log) => {
      const sizes = ['AAAA', 'AAA=', 'AA=='].map((data) => accept([file({ data })])[0]!.bytes);

      log.push(sizes.join(','));
    },
    expected: ['3,2,1'],
  },
  {
    id: 'harness2-an-empty-attachment-list-is-accepted-as-nothing',
    src: 'janux',
    run: (log) => log.push(String(accept([]).length)),
    expected: ['0'],
  },
  {
    id: 'harness2-more-files-than-the-policy-allows-are-refused-as-a-batch',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file(), file(), file(), file(), file()]));
    },
    expected: ['accept:threw:too_many'],
  },
  {
    id: 'harness2-exactly-the-allowed-number-of-files-is-accepted',
    src: 'janux',
    run: (log) => log.push(String(accept([file(), file(), file(), file()]).length)),
    expected: ['4'],
  },
  {
    id: 'harness2-a-policy-may-tighten-the-file-count',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file(), file()], { maxFiles: 1 }));
    },
    expected: ['accept:threw:too_many'],
  },
  {
    id: 'harness2-a-media-type-the-policy-does-not-list-is-refused',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ mediaType: 'application/zip' })]));
    },
    expected: ['accept:threw:bad_type'],
  },
  {
    id: 'harness2-the-default-policy-accepts-the-four-document-types-an-agent-reads',
    src: 'janux',
    run: (log) => {
      const types = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

      log.push(types.map((mediaType) => accept([file({ mediaType })]).length).join(','));
    },
    expected: ['1,1,1,1'],
  },
  {
    id: 'harness2-a-declared-type-list-replaces-the-default-instead-of-adding-to-it',
    src: 'janux',
    run: (log) => {
      attempt(log, 'png', () => accept([file({ mediaType: 'image/png' })], { allowedTypes: ['application/pdf'] }));
    },
    expected: ['png:threw:bad_type'],
  },
  {
    id: 'harness2-media-types-are-matched-exactly-not-by-family',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ mediaType: 'image/png; charset=binary' })]));
    },
    expected: ['accept:threw:bad_type'],
  },
  {
    id: 'harness2-a-file-over-the-per-file-limit-is-refused',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ data: payload(120) })], { maxFileBytes: 100 }));
    },
    expected: ['accept:threw:too_big'],
  },
  {
    id: 'harness2-a-file-exactly-at-the-per-file-limit-is-accepted',
    src: 'janux',
    run: (log) => log.push(String(accept([file({ data: payload(99) })], { maxFileBytes: 99 })[0]!.bytes)),
    expected: ['99'],
  },
  {
    id: 'harness2-files-that-each-fit-but-together-do-not-are-refused-as-a-request',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ data: payload(60) }), file({ data: payload(60) })], { maxFileBytes: 100, maxRequestBytes: 100 }));
    },
    expected: ['accept:threw:request_too_big'],
  },
  {
    id: 'harness2-a-storage-marker-carries-no-bytes-of-its-own',
    src: 'janux',
    run: (log) => log.push(String(accept([file({ data: 's3://bucket/key' })])[0]!.bytes)),
    expected: ['0'],
  },
  {
    id: 'harness2-a-storage-marker-still-costs-the-request-budget-its-own-length',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ data: `s3://bucket/${'k'.repeat(40)}` })], { maxRequestBytes: 20 }));
    },
    expected: ['accept:threw:request_too_big'],
  },
  {
    id: 'harness2-a-marker-longer-than-a-url-is-padding-and-is-refused',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ data: `s3://bucket/${'k'.repeat(3000)}` })]));
    },
    expected: ['accept:threw:too_big'],
  },
  {
    id: 'harness2-a-refusal-carries-a-code-an-operator-can-branch-on',
    src: 'janux',
    run: (log) => {
      try {
        accept([file({ mediaType: 'text/plain' })]);
      } catch (error) {
        log.push(`${error instanceof AttachmentError} ${(error as AttachmentError).code} ${(error as Error).message}`);
      }
    },
    expected: ['true bad_type bad_type'],
  },
  {
    id: 'harness2-the-first-offending-file-decides-the-refusal',
    src: 'janux',
    run: (log) => {
      attempt(log, 'accept', () => accept([file({ mediaType: 'text/plain' }), file({ data: payload(999) })], { maxFileBytes: 10 }));
    },
    expected: ['accept:threw:bad_type'],
  },

  // ── the history budget ──────────────────────────────────────────────────────
  {
    id: 'harness2-budget-an-empty-string-costs-nothing',
    src: 'janux',
    run: (log) => log.push(`${approxTokens('')}:${approxTokens('a')}:${approxTokens('abcdefgh')}`),
    expected: ['0:1:2'],
  },
  {
    id: 'harness2-budget-a-history-that-already-fits-is-left-alone',
    src: 'janux',
    run: async (log) => void log.push(texts(await budget(100, msg('user', 'a'), msg('assistant', 'b')))),
    expected: ['a|b'],
  },
  {
    id: 'harness2-budget-drops-as-many-of-the-oldest-turns-as-it-takes',
    src: 'janux',
    run: async (log) => {
      const long = 'x'.repeat(400);

      log.push(texts(await budget(20, msg('user', long), msg('assistant', long), msg('user', 'newest'))));
    },
    expected: ['newest'],
  },
  {
    id: 'harness2-budget-keeps-the-newest-turn-even-when-it-alone-is-too-large',
    src: 'janux',
    run: async (log) => void log.push(texts(await budget(1, msg('user', 'x'.repeat(4000))))),
    expected: ['x'.repeat(4000)],
  },
  {
    id: 'harness2-budget-of-zero-still-leaves-something-to-answer',
    src: 'janux',
    run: async (log) => void log.push(roles(await budget(0, msg('system', 's'), msg('user', 'ask')))),
    expected: ['system,user'],
  },
  {
    id: 'harness2-budget-keeps-every-system-prompt-however-many-there-are',
    src: 'janux',
    run: async (log) => {
      const long = 'x'.repeat(400);

      log.push(roles(await budget(1, msg('system', long), msg('system', long), msg('user', 'ask'))));
    },
    expected: ['system,system,user'],
  },
  {
    id: 'harness2-budget-preserves-the-order-of-what-survives',
    src: 'janux',
    run: async (log) => {
      const long = 'x'.repeat(400);

      log.push(texts(await budget(60, msg('user', long), msg('assistant', 'b'), msg('user', 'c'))));
    },
    expected: ['b|c'],
  },
  {
    id: 'harness2-budget-treats-a-tool-message-as-history-like-any-other',
    src: 'janux',
    run: async (log) => {
      const long = 'x'.repeat(400);

      log.push(roles(await budget(20, msg('tool', long), msg('user', 'newest'))));
    },
    expected: ['user'],
  },
  {
    id: 'harness2-budget-counts-the-system-prompt-against-the-total',
    src: 'janux',
    run: async (log) => {
      const long = 'y'.repeat(400);

      log.push(roles(await budget(101, msg('system', long), msg('user', 'a'), msg('assistant', 'b'))));
    },
    expected: ['system,assistant'],
  },
  {
    id: 'harness2-budget-a-history-of-one-message-is-never-trimmed',
    src: 'janux',
    run: async (log) => void log.push(texts(await budget(1, msg('user', 'only')))),
    expected: ['only'],
  },
  {
    id: 'harness2-budget-an-empty-turn-stays-empty',
    src: 'janux',
    run: async (log) => void log.push(`messages=${(await budget(10)).messages.length}`),
    expected: ['messages=0'],
  },

  // ── rate limiting ───────────────────────────────────────────────────────────
  {
    id: 'harness2-limit-a-limiter-without-a-store-still-counts',
    src: 'janux',
    run: async (log) => {
      const rl = createRateLimiter({ limit: 2, windowMs: 60_000 });

      log.push(await verdicts((id) => rl.allow(id), 'solo', 3));
    },
    expected: ['yyn'],
  },
  {
    id: 'harness2-limit-the-window-reopens-exactly-when-it-elapses',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl, tick } = limiter({ limit: 1, windowMs: 1_000 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
      tick(1_000);
      log.push(await verdicts((id) => rl.allow(id), 'a', 1));
    },
    expected: ['yn', 'y'],
  },
  {
    id: 'harness2-limit-a-refused-request-still-costs-the-window',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl, tick } = limiter({ limit: 1, windowMs: 1_000 });

      await verdicts((id) => rl.allow(id), 'a', 3);
      tick(500);
      log.push(await verdicts((id) => rl.allow(id), 'a', 1));
    },
    expected: ['n'],
  },
  {
    id: 'harness2-limit-the-global-breaker-counts-only-what-it-let-through',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 1, windowMs: 1_000, globalLimit: 2 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
      log.push(await verdicts((id) => rl.allow(id), 'b', 1));
      log.push(await verdicts((id) => rl.allow(id), 'c', 1));
    },
    expected: ['yn', 'y', 'n'],
  },
  {
    id: 'harness2-limit-a-global-breaker-of-zero-is-off',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 5, windowMs: 1_000, globalLimit: 0 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 3));
    },
    expected: ['yyy'],
  },
  {
    id: 'harness2-limit-the-global-window-is-the-per-identity-window',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl, tick } = limiter({ limit: 5, windowMs: 1_000, globalLimit: 1 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
      tick(1_000);
      log.push(await verdicts((id) => rl.allow(id), 'b', 1));
    },
    expected: ['yn', 'y'],
  },
  {
    id: 'harness2-limit-two-limiters-over-one-store-do-not-share-a-count',
    src: 'janux',
    run: async (log) => {
      let now = 0;
      const store = createMemoryCounterStore(() => now);
      const first = createRateLimiter({ limit: 1, windowMs: 1_000, store });
      const second = createRateLimiter({ limit: 1, windowMs: 1_000, store });

      log.push(`${await first.allow('a')} ${await second.allow('b')}`);
    },
    expected: ['true true'],
  },
  {
    id: 'harness2-limit-an-identity-that-looks-like-another-key-is-still-its-own',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 1, windowMs: 1_000 });

      log.push(`${await rl.allow('__global__')} ${await rl.allow('a')}`);
    },
    expected: ['true true'],
  },
  {
    id: 'harness2-limit-a-store-that-answers-late-is-awaited-not-assumed',
    src: 'janux',
    run: async (log) => {
      let count = 0;
      const rl = createRateLimiter({
        limit: 1,
        windowMs: 1_000,
        store: { incr: async () => Promise.resolve((count += 1)) },
      });

      log.push(await verdicts((id) => rl.allow(id), 'a', 3));
    },
    expected: ['ynn'],
  },
  {
    id: 'harness2-limit-a-store-that-fails-mid-window-lets-the-agent-keep-working',
    src: 'janux',
    run: async (log) => {
      let calls = 0;
      const rl = createRateLimiter({
        limit: 5,
        windowMs: 1_000,
        store: {
          incr() {
            calls += 1;
            if (calls > 1) throw new Error('redis down');

            return calls;
          },
        },
      });

      log.push(await verdicts((id) => rl.allow(id), 'a', 3));
    },
    expected: ['yyy'],
  },
  {
    id: 'harness2-limit-the-memory-store-counts-within-a-window-and-restarts-after-it',
    src: 'janux',
    run: (log) => {
      let now = 0;
      const store = createMemoryCounterStore(() => now);

      log.push(`${store.incr('k', 100)}${store.incr('k', 100)}`);
      now += 99;
      log.push(`${store.incr('k', 100)}`);
      now += 1;
      log.push(`${store.incr('k', 100)}`);
    },
    expected: ['12', '3', '1'],
  },
];
