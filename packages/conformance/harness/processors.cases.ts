import {
  approxTokens,
  historyTokenBudget,
  injectionGuard,
  piiFilter,
  runProcessors,
  unicodeNormalizer,
  type InputProcessor,
  type TurnContext,
} from '@janux/agent';
import type { ScenarioCase } from '../support/scenario';

/**
 * The guardrail pipeline that runs before every agent turn.
 *
 * These processors are the only thing standing between untrusted text and the
 * model, so the rows that matter are the ones where a guard could look like it is
 * working and not be: a scrub that leaves digits behind, a `warn` mode with no
 * output, a normalizer that misses the homoglyph, and a trim that drops the wrong
 * end of the history.
 */

const msg = (role: string, content: unknown) => ({ role, content }) as TurnContext['messages'][number];
const turnOf = (...messages: TurnContext['messages']): TurnContext => ({ messages });
const roles = (turn: TurnContext) => turn.messages.map((message) => message.role).join(',');
const texts = (turn: TurnContext) => turn.messages.map((message) => String(message.content)).join('|');

/** A processor that records it ran, for ordering assertions. */
const marker = (name: string, log: string[]): InputProcessor => ({
  name,
  run(turn) {
    log.push(name);

    return turn;
  },
});

export const PROCESSOR_CASES: ScenarioCase[] = [
  // ── the pipeline ────────────────────────────────────────────────────────────
  {
    id: 'proc-runs-in-declared-order',
    src: 'mastra:processors#order',
    run: async (log) => {
      await runProcessors([marker('first', log), marker('second', log)], turnOf(msg('user', 'x')));
    },
    expected: ['first', 'second'],
  },
  {
    id: 'proc-an-abort-short-circuits-the-rest',
    src: 'mastra:processors#abort',
    run: async (log) => {
      const aborting: InputProcessor = { name: 'stop', run: (turn) => ({ ...turn, aborted: { reason: 'nope' } }) };
      const result = await runProcessors([aborting, marker('never', log)], turnOf(msg('user', 'x')));

      log.push(`aborted=${result.aborted?.reason}`);
    },
    expected: ['aborted=nope'],
  },
  {
    id: 'proc-an-empty-pipeline-passes-the-turn-through',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([], turnOf(msg('user', 'kept')))));
    },
    expected: ['kept'],
  },
  {
    id: 'proc-a-rewrite-is-visible-to-the-next-processor',
    src: 'janux',
    run: async (log) => {
      const upper: InputProcessor = {
        name: 'upper',
        run: (turn) => ({ ...turn, messages: turn.messages.map((m) => ({ ...m, content: String(m.content).toUpperCase() })) }),
      };
      const observe: InputProcessor = {
        name: 'observe',
        run(turn) {
          log.push(texts(turn));

          return turn;
        },
      };

      await runProcessors([upper, observe], turnOf(msg('user', 'quiet')));
    },
    expected: ['QUIET'],
  },

  // ── unicode normalization ───────────────────────────────────────────────────
  {
    id: 'proc-unicode-folds-fullwidth-letters',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([unicodeNormalizer()], turnOf(msg('user', 'ｉｇｎｏｒｅ')))));
    },
    expected: ['ignore'],
  },
  {
    id: 'proc-unicode-strips-a-zero-width-space',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([unicodeNormalizer()], turnOf(msg('user', 'ig​nore')))));
    },
    expected: ['ignore'],
  },
  {
    id: 'proc-unicode-strips-a-right-to-left-override',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([unicodeNormalizer()], turnOf(msg('user', 'a‮b')))));
    },
    expected: ['ab'],
  },
  {
    id: 'proc-unicode-strips-a-zero-width-joiner-run',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([unicodeNormalizer()], turnOf(msg('user', 'i‍g‌n')))));
    },
    expected: ['ign'],
  },
  {
    id: 'proc-unicode-leaves-ordinary-text-alone',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([unicodeNormalizer()], turnOf(msg('user', 'plain text 123')))));
    },
    expected: ['plain text 123'],
  },
  {
    id: 'proc-unicode-keeps-emoji',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([unicodeNormalizer()], turnOf(msg('user', 'hi 🎉')))));
    },
    expected: ['hi 🎉'],
  },
  {
    id: 'proc-unicode-leaves-non-string-content-untouched',
    src: 'janux',
    run: async (log) => {
      const result = await runProcessors([unicodeNormalizer()], turnOf(msg('user', [{ type: 'image' }])));

      log.push(JSON.stringify(result.messages[0]!.content));
    },
    expected: ['[{"type":"image"}]'],
  },

  // ── PII scrubbing ───────────────────────────────────────────────────────────
  {
    id: 'proc-pii-masks-an-email',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'write to ada@example.com now')))));
    },
    expected: ['write to [email] now'],
  },
  {
    id: 'proc-pii-masks-an-email-with-a-plus-tag',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'ada+tag@example.co.uk')))));
    },
    expected: ['[email]'],
  },
  {
    id: 'proc-pii-masks-a-spaced-card-number-whole',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'card 4111 1111 1111 1111 end')))));
    },
    expected: ['card [card] end'],
  },
  {
    id: 'proc-pii-masks-a-dashed-card-number-whole',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', '4111-1111-1111-1111')))));
    },
    expected: ['[card]'],
  },
  {
    id: 'proc-pii-masks-a-bare-16-digit-card',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', '4111111111111111')))));
    },
    expected: ['[card]'],
  },
  {
    id: 'proc-pii-masks-a-phone-number',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'ring 600123456 please')))));
    },
    expected: ['ring [phone] please'],
  },
  {
    id: 'proc-pii-masks-every-occurrence',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'a@b.com and c@d.com')))));
    },
    expected: ['[email] and [email]'],
  },
  {
    id: 'proc-pii-leaves-a-short-number-alone',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'order 1234')))));
    },
    expected: ['order 1234'],
  },
  {
    id: 'proc-pii-scrubs-every-message-not-just-the-last',
    src: 'janux',
    run: async (log) => {
      log.push(texts(await runProcessors([piiFilter()], turnOf(msg('user', 'a@b.com'), msg('assistant', 'c@d.com')))));
    },
    expected: ['[email]|[email]'],
  },

  // ── history budget ──────────────────────────────────────────────────────────
  {
    id: 'proc-budget-approximates-four-characters-per-token',
    src: 'janux',
    run: (log) => {
      log.push(`${approxTokens('')}:${approxTokens('abcd')}:${approxTokens('abcde')}`);
    },
    expected: ['0:1:2'],
  },
  {
    id: 'proc-budget-leaves-a-small-history-alone',
    src: 'janux',
    run: async (log) => {
      log.push(roles(await runProcessors([historyTokenBudget(1000)], turnOf(msg('system', 's'), msg('user', 'a'), msg('assistant', 'b')))));
    },
    expected: ['system,user,assistant'],
  },
  {
    id: 'proc-budget-drops-the-oldest-turn-first',
    src: 'janux',
    run: async (log) => {
      const turn = turnOf(msg('system', 's'), msg('user', 'x'.repeat(400)), msg('assistant', 'keep me'));

      log.push(texts(await runProcessors([historyTokenBudget(20)], turn)));
    },
    expected: ['s|keep me'],
  },
  {
    id: 'proc-budget-never-drops-the-system-prompt',
    src: 'janux',
    run: async (log) => {
      const turn = turnOf(msg('system', 'y'.repeat(400)), msg('user', 'x'.repeat(400)), msg('assistant', 'b'));

      log.push(roles(await runProcessors([historyTokenBudget(1)], turn)));
    },
    expected: ['system,assistant'],
  },
  {
    id: 'proc-budget-always-keeps-at-least-one-non-system-message',
    src: 'janux',
    run: async (log) => {
      const turn = turnOf(msg('system', 's'), msg('user', 'x'.repeat(4000)));

      log.push(roles(await runProcessors([historyTokenBudget(1)], turn)));
    },
    expected: ['system,user'],
  },
  {
    id: 'proc-budget-keeps-system-prompts-ahead-of-the-history',
    src: 'janux',
    run: async (log) => {
      const turn = turnOf(msg('user', 'a'), msg('system', 's'), msg('assistant', 'b'));

      log.push(roles(await runProcessors([historyTokenBudget(1000)], turn)));
    },
    expected: ['system,user,assistant'],
  },
  {
    id: 'proc-budget-counts-non-string-content-by-its-json',
    src: 'janux',
    run: async (log) => {
      const turn = turnOf(msg('system', 's'), msg('user', [{ pad: 'z'.repeat(400) }]), msg('assistant', 'keep'));

      log.push(texts(await runProcessors([historyTokenBudget(20)], turn)));
    },
    expected: ['s|keep'],
  },

  // ── injection guard ─────────────────────────────────────────────────────────
  {
    id: 'proc-injection-block-aborts-the-turn',
    src: 'janux',
    run: async (log) => {
      const result = await runProcessors([injectionGuard(() => 'suspicious', 'block')], turnOf(msg('user', 'bad')));

      log.push(`aborted=${result.aborted?.reason}`);
    },
    expected: ['aborted=prompt_injection'],
  },
  {
    id: 'proc-injection-block-is-the-default-mode',
    src: 'janux',
    run: async (log) => {
      const result = await runProcessors([injectionGuard(() => 'suspicious')], turnOf(msg('user', 'bad')));

      log.push(`aborted=${result.aborted?.reason}`);
    },
    expected: ['aborted=prompt_injection'],
  },
  {
    id: 'proc-injection-warn-reports-without-aborting',
    src: 'janux',
    run: async (log) => {
      const result = await runProcessors([injectionGuard(() => 'suspicious', 'warn')], turnOf(msg('user', 'bad')));

      log.push(`warnings=${JSON.stringify(result.warnings)}`, `aborted=${String(result.aborted)}`);
    },
    expected: ['warnings=["prompt_injection"]', 'aborted=undefined'],
  },
  {
    id: 'proc-injection-a-clean-turn-records-nothing',
    src: 'janux',
    run: async (log) => {
      const result = await runProcessors([injectionGuard(() => 'ok', 'warn')], turnOf(msg('user', 'fine')));

      log.push(`warnings=${String(result.warnings)}`);
    },
    expected: ['warnings=undefined'],
  },
  {
    id: 'proc-injection-warnings-accumulate-across-processors',
    src: 'janux',
    run: async (log) => {
      const guard = injectionGuard(() => 'suspicious', 'warn');
      const result = await runProcessors([guard, guard], turnOf(msg('user', 'bad')));

      log.push(JSON.stringify(result.warnings));
    },
    expected: ['["prompt_injection","prompt_injection"]'],
  },
  {
    id: 'proc-injection-classifies-only-the-newest-user-message',
    src: 'janux',
    run: async (log) => {
      const guard = injectionGuard((text) => {
        log.push(`saw=${text}`);

        return 'ok';
      });

      await runProcessors([guard], turnOf(msg('user', 'old'), msg('assistant', 'reply'), msg('user', 'newest')));
    },
    expected: ['saw=newest'],
  },
  {
    id: 'proc-injection-skips-a-turn-with-no-user-text',
    src: 'janux',
    run: async (log) => {
      const guard = injectionGuard(() => {
        log.push('classified');

        return 'suspicious';
      });
      const result = await runProcessors([guard], turnOf(msg('system', 's')));

      log.push(`aborted=${String(result.aborted)}`);
    },
    expected: ['aborted=undefined'],
  },
  {
    id: 'proc-injection-skips-non-string-user-content',
    src: 'janux',
    run: async (log) => {
      const result = await runProcessors([injectionGuard(() => 'suspicious')], turnOf(msg('user', [{ type: 'image' }])));

      log.push(`aborted=${String(result.aborted)}`);
    },
    expected: ['aborted=undefined'],
  },
  {
    id: 'proc-injection-runs-after-normalization-when-ordered-that-way',
    src: 'janux',
    run: async (log) => {
      const guard = injectionGuard((text) => {
        log.push(`saw=${text}`);

        return 'ok';
      });

      await runProcessors([unicodeNormalizer(), guard], turnOf(msg('user', 'ｉｇｎｏｒｅ​all')));
    },
    expected: ['saw=ignoreall'],
  },
];
