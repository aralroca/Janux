import { jsx } from 'janux';
import { bool, int, schema, str } from 'janux/types';
import type { IntentRef } from '../../janux/src/define/types';
import type { ScenarioCase } from '../support/scenario';
import { act, fire, island, pick, serve, settle, text, type as typeInto } from './harness';

/**
 * Controlled inputs, the IME commit gate, and what a re-render is not allowed
 * to disturb: the caret, the selection, and which element has focus.
 *
 * "No cursor jumps" is the rule these rows exist to defend — a framework that
 * writes a value back into a focused control while the user is typing is
 * unusable in Japanese, and merely annoying in English.
 */

type Refs = Record<string, IntentRef & ((input?: unknown) => Promise<unknown>)>;

/** A controlled text field bound to `state.q`, plus an unrelated counter to force re-renders. */
function field(log: string[], transform: (value: string) => string = (value) => value) {
  return island({
    state: schema({ q: str().default(''), n: int().default(0) }),
    intents: {
      set: act({
        input: schema({ value: str() }),
        run: ({ state, input }) => {
          const next = transform((input as { value: string }).value);

          log.push(`commit:${next}`);
          (state as { q: string }).q = next;
        },
      }),
      bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }),
    },
    view: ({ state, intents }) =>
      jsx('div', {
        children: [
          jsx('input', { class: 'q', value: (state as { q: string }).q, onInput: (intents as Refs).set }),
          jsx('output', { children: `n=${(state as { n: number }).n}` }),
        ],
      }),
  });
}

/** `compositionend` on the bound control. */
function endComposition(selector: string, value: string): void {
  const control = pick<HTMLInputElement>(selector);

  control.value = value;
  control.dispatchEvent(new Event('compositionend', { bubbles: true }));
}

export const CONTROLS_IME_CASES: ScenarioCase[] = [
  // ── the IME commit gate ────────────────────────────────────────────────────
  {
    id: 'evt-keystrokes-mid-composition-are-held-back',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      typeInto('.q', 'n', true);
      typeInto('.q', 'ni', true);
      await settle(client);
      log.push(`dom:${(pick('.q') as HTMLInputElement).value}`);
    },
    expected: ['dom:ni'],
  },
  {
    id: 'evt-compositionend-commits-the-composed-text-once',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      typeInto('.q', 'にほ', true);
      endComposition('.q', 'にほん');
      await settle(client);
    },
    expected: ['commit:にほん'],
  },
  {
    id: 'evt-the-webkit-order-compositionend-then-input-still-commits-once',
    src: 'preact:compositionend#webkit-duplicate',
    run: async (log) => {
      const { client } = await serve(field(log));

      endComposition('.q', 'にほん');
      await settle(client);
      typeInto('.q', 'にほん');
      await settle(client);
    },
    expected: ['commit:にほん'],
  },
  {
    id: 'evt-a-second-composition-round-commits-again',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      endComposition('.q', 'にほん');
      await settle(client);
      typeInto('.q', 'にほんご', true);
      endComposition('.q', 'にほんご');
      await settle(client);
    },
    expected: ['commit:にほん', 'commit:にほんご'],
  },
  {
    id: 'evt-typing-the-same-value-twice-commits-once',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      typeInto('.q', 'abc');
      typeInto('.q', 'abc');
      await settle(client);
    },
    expected: ['commit:abc'],
  },
  {
    id: 'evt-returning-to-a-value-that-was-already-committed-commits-again',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      typeInto('.q', 'a');
      typeInto('.q', 'ab');
      typeInto('.q', 'a');
      await settle(client);
    },
    expected: ['commit:a', 'commit:ab', 'commit:a'],
  },
  {
    id: 'evt-the-commit-gate-is-per-control-so-two-fields-with-the-same-text-both-commit',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { set: act({ input: schema({ value: str() }), run: ({ input }) => log.push(`commit:${(input as { value: string }).value}`) }) },
        view: ({ intents }) =>
          jsx('div', {
            children: [
              jsx('input', { class: 'one', onInput: (intents as Refs).set }),
              jsx('input', { class: 'two', onInput: (intents as Refs).set }),
            ],
          }),
      });
      const { client } = await serve(def);

      typeInto('.one', 'same');
      typeInto('.two', 'same');
      await settle(client);
    },
    expected: ['commit:same', 'commit:same'],
  },
  {
    id: 'evt-a-composition-that-ends-without-changing-the-text-commits-nothing-new',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      typeInto('.q', 'abc');
      await settle(client);
      endComposition('.q', 'abc');
      await settle(client);
    },
    expected: ['commit:abc'],
  },
  {
    id: 'evt-a-toggle-does-not-go-through-the-input-gate-so-two-changes-both-arrive',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { flip: act({ input: schema({ value: bool() }), run: ({ input }) => log.push(`flip:${(input as { value: boolean }).value}`) }) },
        view: ({ intents }) => jsx('input', { class: 'c', type: 'checkbox', onChange: (intents as Refs).flip }),
      });
      const { client } = await serve(def);
      const box = pick<HTMLInputElement>('.c');

      box.checked = true;
      fire('.c', 'change');
      box.checked = false;
      fire('.c', 'change');
      box.checked = false;
      fire('.c', 'change');
      await settle(client);
    },
    expected: ['flip:true', 'flip:false', 'flip:false'],
  },
  {
    id: 'evt-a-checkbox-bound-to-input-does-go-through-the-gate-on-its-checked-state',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { flip: act({ input: schema({ value: bool() }), run: ({ input }) => log.push(`flip:${(input as { value: boolean }).value}`) }) },
        view: ({ intents }) => jsx('input', { class: 'c', type: 'checkbox', onInput: (intents as Refs).flip }),
      });
      const { client } = await serve(def);
      const box = pick<HTMLInputElement>('.c');

      box.checked = true;
      fire('.c', 'input');
      box.checked = true;
      fire('.c', 'input');
      await settle(client);
    },
    expected: ['flip:true'],
  },

  // ── the DOM the user is holding ────────────────────────────────────────────
  {
    id: 'evt-a-focused-control-is-not-rewritten-by-the-state-it-just-updated',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log, (value) => value.toUpperCase()));
      const control = pick<HTMLInputElement>('.q');

      control.focus();
      typeInto('.q', 'abc');
      await settle(client);
      log.push(`dom:${control.value}`, `state:${((await client.read('ui://w#default')) as { state: { q: string } }).state.q}`);
    },
    expected: ['commit:ABC', 'dom:abc', 'state:ABC'],
  },
  {
    id: 'evt-the-same-write-lands-in-the-dom-once-the-control-is-no-longer-focused',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log, (value) => value.toUpperCase()));
      const control = pick<HTMLInputElement>('.q');

      control.focus();
      typeInto('.q', 'abc');
      await settle(client);
      control.blur();
      await client.call('w.bump');
      log.push(`dom:${control.value}`);
    },
    expected: ['commit:ABC', 'dom:ABC'],
  },
  {
    id: 'evt-an-agent-write-reaches-an-unfocused-control-immediately',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      await client.call('w.set', { value: 'from-agent' });
      log.push(`dom:${(pick('.q') as HTMLInputElement).value}`);
    },
    expected: ['commit:from-agent', 'dom:from-agent'],
  },
  {
    id: 'evt-a-re-render-caused-by-something-else-does-not-move-the-caret',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));
      const control = pick<HTMLInputElement>('.q');

      await client.call('w.set', { value: 'abcdef' });
      control.focus();
      control.setSelectionRange(3, 3);
      await client.call('w.bump');
      log.push(`caret:${control.selectionStart}`, `dom:${control.value}`, `out:${text('output')}`);
    },
    expected: ['commit:abcdef', 'caret:3', 'dom:abcdef', 'out:n=1'],
  },
  {
    id: 'evt-a-re-render-does-not-collapse-a-selection-the-user-made',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));
      const control = pick<HTMLInputElement>('.q');

      await client.call('w.set', { value: 'abcdef' });
      control.focus();
      control.setSelectionRange(1, 4);
      await client.call('w.bump');
      log.push(`range:${control.selectionStart}-${control.selectionEnd}`);
    },
    expected: ['commit:abcdef', 'range:1-4'],
  },
  {
    id: 'evt-a-re-render-does-not-steal-focus-from-the-control-that-had-it',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));
      const control = pick<HTMLInputElement>('.q');

      control.focus();
      await client.call('w.bump');
      log.push(`focused:${document.activeElement === control}`);
    },
    expected: ['focused:true'],
  },
  {
    id: 'evt-typing-fast-leaves-the-dom-showing-the-last-thing-typed',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(field(log));

      ['j', 'ja', 'jan', 'jane'].forEach((value) => typeInto('.q', value));
      await settle(client);
      log.push(`dom:${(pick('.q') as HTMLInputElement).value}`);
    },
    expected: ['commit:j', 'commit:ja', 'commit:jan', 'commit:jane', 'dom:jane'],
  },
  {
    id: 'evt-a-controlled-select-is-synced-after-its-options-exist',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ plan: str().default('basic'), pro: bool().default(false) }),
        intents: {
          upgrade: act({
            run: ({ state }) => {
              (state as { pro: boolean }).pro = true;
              (state as { plan: string }).plan = 'pro';
            },
          }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'up', onClick: (intents as Refs).upgrade }),
              jsx('select', {
                class: 's',
                value: (state as { plan: string }).plan,
                children: [
                  jsx('option', { value: 'basic', children: 'Basic' }),
                  (state as { pro: boolean }).pro ? jsx('option', { value: 'pro', children: 'Pro' }) : null,
                ],
              }),
            ],
          }),
      });
      const { client } = await serve(def);

      log.push(`before:${(pick('.s') as HTMLSelectElement).value}`);
      fire('.up', 'click');
      await settle(client);
      log.push(`after:${(pick('.s') as HTMLSelectElement).value}`);
    },
    expected: ['before:basic', 'after:pro'],
  },
  {
    id: 'evt-a-controlled-textarea-heals-when-the-dom-drifts-from-the-state',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ note: str().default('kept'), n: int().default(0) }),
        intents: { bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'b', onClick: (intents as Refs).bump }),
              jsx('textarea', { class: 't', value: (state as { note: string }).note }),
            ],
          }),
      });
      const { client } = await serve(def);

      (pick('.t') as HTMLTextAreaElement).value = 'drifted';
      fire('.b', 'click');
      await settle(client);
      log.push(`dom:${(pick('.t') as HTMLTextAreaElement).value}`);
    },
    expected: ['dom:kept'],
  },
  {
    id: 'evt-a-controlled-checkbox-follows-the-state-when-it-is-not-focused',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ on: bool().default(false) }),
        intents: { flip: act({ run: ({ state }) => ((state as { on: boolean }).on = !(state as { on: boolean }).on) }) },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'b', onClick: (intents as Refs).flip }),
              jsx('input', { class: 'c', type: 'checkbox', checked: (state as { on: boolean }).on }),
            ],
          }),
      });
      const { client } = await serve(def);

      log.push(`before:${(pick('.c') as HTMLInputElement).checked}`);
      fire('.b', 'click');
      await settle(client);
      log.push(`after:${(pick('.c') as HTMLInputElement).checked}`);
    },
    expected: ['before:false', 'after:true'],
  },
  {
    id: 'evt-clearing-the-state-behind-a-control-empties-it-rather-than-writing-null',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ q: str().default('something') }),
        intents: { clear: act({ run: ({ state }) => ((state as { q: string }).q = '') }) },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'b', onClick: (intents as Refs).clear }),
              jsx('input', { class: 'q', value: (state as { q: string }).q }),
            ],
          }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
      log.push(`dom:${JSON.stringify((pick('.q') as HTMLInputElement).value)}`);
    },
    expected: ['dom:""'],
  },
  {
    id: 'evt-a-form-reset-empties-a-focused-field-which-a-controlled-write-could-not',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ sent: str().default('') }),
        intents: {
          send: act({ input: schema({ text: str() }), run: ({ state, input }) => ((state as { sent: string }).sent = (input as { text: string }).text) }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('form', { class: 'f', onSubmit: (intents as Refs).send, reset: true, children: jsx('input', { name: 'text' }) }),
              jsx('output', { children: (state as { sent: string }).sent }),
            ],
          }),
      });
      const { client } = await serve(def);
      const control = pick<HTMLInputElement>('[name=text]');

      control.value = 'ask something';
      control.focus();
      fire('.f', 'submit');
      await settle(client);
      log.push(`field:${control.value}`, `sent:${text('output')}`, `focused:${document.activeElement === control}`);
    },
    expected: ['field:', 'sent:ask something', 'focused:true'],
  },
  {
    id: 'evt-an-input-inside-a-list-keeps-its-value-when-a-sibling-row-changes',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(1) }),
        intents: { add: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'add', onClick: (intents as Refs).add }),
              jsx('ul', {
                children: Array.from({ length: (state as { n: number }).n }, (_unused, index) =>
                  jsx('li', { key: `row-${index}`, children: jsx('input', { class: `row-${index}` }) }),
                ),
              }),
            ],
          }),
      });
      const { client } = await serve(def);

      (pick('.row-0') as HTMLInputElement).value = 'typed here';
      fire('.add', 'click');
      await settle(client);
      log.push(`kept:${(pick('.row-0') as HTMLInputElement).value}`, `rows:${document.querySelectorAll('li').length}`);
    },
    expected: ['kept:typed here', 'rows:2'],
  },
];
