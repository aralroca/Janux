import { jsx } from 'janux';
import { bool, int, list, num, schema, str } from 'janux/types';
import type { IntentDef, IntentRef } from '../../janux/src/define/types';
import type { ScenarioCase } from '../support/scenario';
import { act, fire, fireKey, fireMouse, island, listenDoc, pick, serve, settle, type as typeInto } from './harness';

/**
 * What an event hands the intent it triggers.
 *
 * The payload is derived, never authored: the control's value, the keyboard
 * facts, where the pointer was, the form's fields — with the element's
 * `data-input` (what `.with()` wrote) on top. A schema is what makes any of it
 * visible: an intent that declares no input receives nothing at all.
 */

type Refs = Record<string, IntentRef & ((input?: unknown) => Promise<unknown>)>;

/** One element, one bound event, and an intent that logs the input it received. */
function bound(log: string[], tag: string, prop: string, props: Record<string, unknown>, def: Partial<IntentDef>) {
  return island({
    intents: { go: act({ ...def, run: ({ input }) => log.push(JSON.stringify(input) ?? 'undefined') }) },
    view: ({ intents }) => jsx(tag, { class: 'b', [prop]: (intents as Refs).go, ...props }),
  });
}

/** A `<form>` whose submit intent logs the values it was handed. */
function form(log: string[], children: unknown, def: Partial<IntentDef> = {}, props: Record<string, unknown> = {}) {
  return island({
    intents: { send: act({ ...def, run: ({ input }) => log.push(JSON.stringify(input) ?? 'undefined') }) },
    view: ({ intents }) => jsx('form', { class: 'b', onSubmit: (intents as Refs).send, ...props, children }),
  });
}

export const EVENT_PAYLOAD_CASES: ScenarioCase[] = [
  // ── the control's own value ────────────────────────────────────────────────
  {
    id: 'evt-an-input-event-hands-the-controls-value-to-the-intent',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onInput', {}, { input: schema({ value: str() }) }));

      typeInto('.b', 'didit');
      await settle(client);
    },
    expected: ['{"value":"didit"}'],
  },
  {
    id: 'evt-a-textareas-value-arrives-the-same-way-as-an-inputs',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'textarea', 'onInput', {}, { input: schema({ value: str() }) }));

      typeInto('.b', 'a long note');
      await settle(client);
    },
    expected: ['{"value":"a long note"}'],
  },
  {
    id: 'evt-a-selects-change-carries-the-chosen-option',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ input: schema({ value: str() }), run: ({ input }) => log.push(JSON.stringify(input)) }) },
        view: ({ intents }) =>
          jsx('select', {
            class: 'b',
            onChange: (intents as Refs).go,
            children: [jsx('option', { value: 'one', children: '1' }), jsx('option', { value: 'two', children: '2' })],
          }),
      });
      const { client } = await serve(def);

      (pick('.b') as HTMLSelectElement).value = 'two';
      fire('.b', 'change');
      await settle(client);
    },
    expected: ['{"value":"two"}'],
  },
  {
    id: 'evt-a-checkbox-reports-whether-it-is-checked-not-its-value-attribute',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'input', 'onChange', { type: 'checkbox', value: 'newsletter' }, { input: schema({ value: bool() }) }),
      );

      (pick('.b') as HTMLInputElement).checked = true;
      fire('.b', 'change');
      await settle(client);
    },
    expected: ['{"value":true}'],
  },
  {
    id: 'evt-an-unchecked-checkbox-reports-false-rather-than-nothing',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onChange', { type: 'checkbox' }, { input: schema({ value: bool() }) }));

      fire('.b', 'change');
      await settle(client);
    },
    expected: ['{"value":false}'],
  },
  {
    id: 'evt-a-radio-reports-its-checked-state-like-a-checkbox',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onChange', { type: 'radio' }, { input: schema({ value: bool() }) }));

      (pick('.b') as HTMLInputElement).checked = true;
      fire('.b', 'change');
      await settle(client);
    },
    expected: ['{"value":true}'],
  },
  {
    id: 'evt-a-number-input-still-hands-over-a-string-until-something-coerces-it',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'input', 'onInput', { type: 'number' }, { coerce: 'form', input: schema({ value: int() }) }),
      );

      typeInto('.b', '42');
      await settle(client);
    },
    expected: ['{"value":42}'],
  },
  {
    id: 'evt-a-non-control-element-contributes-no-value-at-all',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'div', 'onWheel', {}, { input: schema({ value: str().default('none') }) }));

      fire('.b', 'wheel');
      await settle(client);
    },
    expected: ['{"value":"none"}'],
  },
  {
    // The commit gate remembers the last value it dispatched *per control*, and
    // a control it has never seen has no last value — so clearing a field
    // commits an empty string once, and only once.
    id: 'evt-an-empty-control-value-is-an-empty-string-not-a-missing-field',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onInput', {}, { input: schema({ value: str() }) }));

      typeInto('.b', '');
      typeInto('.b', '');
      await settle(client);
      log.push('done');
    },
    expected: ['{"value":""}', 'done'],
  },

  // ── keyboard facts ─────────────────────────────────────────────────────────
  {
    id: 'evt-a-keydown-carries-the-key-and-the-physical-code',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'div', 'onKeyDown', {}, { input: schema({ key: str(), code: str() }) }));

      fireKey('.b', { key: 'Enter', code: 'NumpadEnter' });
      await settle(client);
    },
    expected: ['{"key":"Enter","code":"NumpadEnter"}'],
  },
  {
    id: 'evt-a-keydown-carries-all-four-modifier-flags',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'div', 'onKeyDown', {}, { input: schema({ altKey: bool(), ctrlKey: bool(), metaKey: bool(), shiftKey: bool() }) }),
      );

      fireKey('.b', { key: 'S', metaKey: true, shiftKey: true });
      await settle(client);
    },
    expected: ['{"altKey":false,"ctrlKey":false,"metaKey":true,"shiftKey":true}'],
  },
  {
    id: 'evt-a-keystroke-on-a-control-carries-its-value-alongside-the-key',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onKeyDown', {}, { input: schema({ key: str(), value: str() }) }));

      (pick('.b') as HTMLInputElement).value = 'draft';
      fireKey('.b', { key: 'Enter' });
      await settle(client);
    },
    expected: ['{"key":"Enter","value":"draft"}'],
  },
  {
    id: 'evt-a-non-keyboard-event-carries-no-key-facts',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'div', 'onWheel', {}, { input: schema({ key: str().default('none') }) }));

      fire('.b', 'wheel');
      await settle(client);
    },
    expected: ['{"key":"none"}'],
  },

  // ── pointer facts ──────────────────────────────────────────────────────────
  {
    id: 'evt-a-mouse-family-event-reports-where-it-happened',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'div', 'onDoubleClick', {}, { input: schema({ x: int(), y: int() }) }));

      fireMouse('.b', 'dblclick', { clientX: 12, clientY: 34 });
      await settle(client);
    },
    expected: ['{"x":12,"y":34}'],
  },
  {
    id: 'evt-a-pointer-event-reports-coordinates-through-the-same-mouse-lineage',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'div', 'onPointerUp', {}, { input: schema({ x: int(), y: int() }) }));

      fireMouse('.b', 'pointerup', { clientX: 5, clientY: 6 });
      await settle(client);
    },
    expected: ['{"x":5,"y":6}'],
  },
  {
    id: 'evt-a-plain-click-hands-over-no-coordinates-only-what-the-markup-declared',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'button', 'onClick', {}, { input: schema({ x: int().default(-1), y: int().default(-1) }) }),
      );

      fireMouse('.b', 'click', { clientX: 9, clientY: 9 });
      await settle(client);
    },
    expected: ['{"x":-1,"y":-1}'],
  },
  {
    id: 'evt-a-synthetic-event-without-mouse-coordinates-simply-has-none',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'div', 'onDoubleClick', {}, { input: schema({ x: int().default(-1) }) }));

      fire('.b', 'dblclick');
      await settle(client);
    },
    expected: ['{"x":-1}'],
  },

  // ── data-input on top ──────────────────────────────────────────────────────
  {
    id: 'evt-a-bound-input-reaches-the-intent-through-the-rendered-data-input',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ input: schema({ id: str() }), run: ({ input }) => log.push(JSON.stringify(input)) }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).go.with({ id: 'boots' }) }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
    },
    expected: ['{"id":"boots"}'],
  },
  {
    id: 'evt-each-row-of-a-list-carries-its-own-bound-input',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { add: act({ input: schema({ id: str() }), run: ({ input }) => log.push((input as { id: string }).id) }) },
        view: ({ intents }) =>
          jsx('ul', {
            children: ['sneakers', 'boots', 'sandals'].map((id) =>
              jsx('li', { class: id, onClick: (intents as Refs).add.with({ id }) }),
            ),
          }),
      });
      const { client } = await serve(def);

      fire('.boots', 'click');
      fire('.sandals', 'click');
      fire('.sneakers', 'click');
      await settle(client);
    },
    expected: ['boots', 'sandals', 'sneakers'],
  },
  {
    id: 'evt-the-bound-input-wins-over-the-value-the-control-would-have-reported',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ input: schema({ value: str() }), run: ({ input }) => log.push(JSON.stringify(input)) }) },
        view: ({ intents }) => jsx('input', { class: 'b', onInput: (intents as Refs).go.with({ value: 'declared' }) }),
      });
      const { client } = await serve(def);

      typeInto('.b', 'typed');
      await settle(client);
    },
    expected: ['{"value":"declared"}'],
  },
  {
    id: 'evt-a-bound-input-merges-with-the-keyboard-facts-it-does-not-replace-them',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ input: schema({ key: str(), pane: str() }), run: ({ input }) => log.push(JSON.stringify(input)) }) },
        view: ({ intents }) => jsx('div', { class: 'b', onKeyDown: (intents as Refs).go.with({ pane: 'left' }) }),
      });
      const { client } = await serve(def);

      fireKey('.b', { key: 'j' });
      await settle(client);
    },
    expected: ['{"key":"j","pane":"left"}'],
  },
  {
    id: 'evt-a-hand-written-data-input-is-read-as-the-intents-input',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'button', 'onClick', { 'data-input': '{"id":"typed-by-hand"}' }, { input: schema({ id: str() }) }),
      );

      fire('.b', 'click');
      await settle(client);
    },
    expected: ['{"id":"typed-by-hand"}'],
  },
  {
    id: 'evt-a-json-array-in-data-input-arrives-as-an-array-not-an-object',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'button', 'onClick', { 'data-input': '[1,2,3]' }, {}));

      fire('.b', 'click');
      await settle(client);
      log.push('done');
    },
    expected: ['undefined', 'done'],
  },
  {
    id: 'evt-a-json-scalar-in-data-input-is-passed-through-and-fails-an-object-schema',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'button', 'onClick', { 'data-input': '"just a string"' }, { input: schema({ id: str() }) }),
      );
      const stop = listenDoc('janux:error', (detail) => log.push(String(detail)));

      fire('.b', 'click');
      await settle(client);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stop();
    },
    expected: ['Error: Invalid input for "w.go" — : expected object'],
  },
  {
    id: 'evt-an-empty-data-input-object-still-lets-the-schema-defaults-fill-in',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        bound(log, 'button', 'onClick', { 'data-input': '{}' }, { input: schema({ page: int().default(1) }) }),
      );

      fire('.b', 'click');
      await settle(client);
    },
    expected: ['{"page":1}'],
  },
  {
    id: 'evt-an-event-payload-the-schema-does-not-declare-never-reaches-the-run-body',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onKeyDown', {}, { input: schema({ key: str() }) }));

      fireKey('.b', { key: 'a', code: 'KeyA', shiftKey: true });
      await settle(client);
    },
    expected: ['{"key":"a"}'],
  },
  {
    id: 'evt-an-intent-with-no-schema-receives-nothing-however-rich-the-event-was',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(bound(log, 'input', 'onKeyDown', { 'data-input': '{"id":"x"}' }, {}));

      fireKey('.b', { key: 'a' });
      await settle(client);
    },
    expected: ['undefined'],
  },
  {
    id: 'evt-an-event-payload-that-fails-validation-reports-and-changes-nothing',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ q: str().default('start') }),
        intents: {
          set: act({
            input: schema({ value: int() }),
            run: ({ state, input }) => ((state as { q: string }).q = String((input as { value: number }).value)),
          }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('input', { class: 'b', onInput: (intents as Refs).set }),
              jsx('output', { children: (state as { q: string }).q }),
            ],
          }),
      });
      const { client } = await serve(def);
      const stop = listenDoc('janux:error', () => log.push('reported'));

      typeInto('.b', 'not a number');
      await settle(client);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stop();
      log.push(pick('output').textContent ?? '');
    },
    expected: ['reported', 'start'],
  },

  // ── forms ──────────────────────────────────────────────────────────────────
  {
    id: 'evt-a-submit-hands-over-the-forms-named-fields',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, [jsx('input', { name: 'who', value: 'jane' }), jsx('input', { name: 'topic', value: 'kyc' })], {
          input: schema({ who: str(), topic: str() }),
        }),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"who":"jane","topic":"kyc"}'],
  },
  {
    id: 'evt-a-repeated-field-name-arrives-as-a-list-not-as-its-last-value',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(
          log,
          [
            jsx('input', { name: 'tag', type: 'checkbox', value: 'x', checked: true }),
            jsx('input', { name: 'tag', type: 'checkbox', value: 'y', checked: true }),
          ],
          { input: schema({ tag: list(str()) }) },
        ),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"tag":["x","y"]}'],
  },
  {
    id: 'evt-a-name-that-appears-once-stays-a-scalar',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, jsx('input', { name: 'tag', type: 'checkbox', value: 'x', checked: true }), { input: schema({ tag: str() }) }),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"tag":"x"}'],
  },
  {
    id: 'evt-an-unchecked-box-contributes-nothing-to-the-submitted-values',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, jsx('input', { name: 'ok', type: 'checkbox', value: 'yes' }), { input: schema({ ok: bool().default(false) }), coerce: 'form' }),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"ok":false}'],
  },
  {
    id: 'evt-a-textarea-inside-the-form-is-submitted-by-name',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(form(log, jsx('textarea', { name: 'note', children: 'hello' }), { input: schema({ note: str() }) }));

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"note":"hello"}'],
  },
  {
    id: 'evt-an-unnamed-field-cannot-be-submitted',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, [jsx('input', { value: 'anonymous' }), jsx('input', { name: 'who', value: 'jane' })], { input: schema({ who: str() }) }),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"who":"jane"}'],
  },
  {
    id: 'evt-a-disabled-field-is-left-out-of-the-submitted-values',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, [jsx('input', { name: 'who', value: 'jane', disabled: true }), jsx('input', { name: 'topic', value: 'kyc' })], {
          input: schema({ who: str().default('absent'), topic: str() }),
        }),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"who":"absent","topic":"kyc"}'],
  },
  {
    id: 'evt-form-coercion-turns-the-fields-into-the-declared-types',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, [jsx('input', { name: 'qty', value: '3' }), jsx('input', { name: 'ratio', value: '0.5' })], {
          coerce: 'form',
          input: schema({ qty: int(), ratio: num() }),
        }),
      );

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"qty":3,"ratio":0.5}'],
  },
  {
    id: 'evt-a-form-marked-reset-empties-itself-once-the-intent-has-the-values',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, jsx('input', { name: 'text' }), { input: schema({ text: str() }) }, { reset: true }),
      );

      (pick('[name=text]') as HTMLInputElement).value = 'invite jane';
      fire('.b', 'submit');
      await settle(client);
      log.push(`field:${(pick('[name=text]') as HTMLInputElement).value}`);
    },
    expected: ['{"text":"invite jane"}', 'field:'],
  },
  {
    id: 'evt-a-form-without-reset-keeps-what-the-user-typed',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(form(log, jsx('input', { name: 'text' }), { input: schema({ text: str() }) }));

      (pick('[name=text]') as HTMLInputElement).value = 'still here';
      fire('.b', 'submit');
      await settle(client);
      log.push(`field:${(pick('[name=text]') as HTMLInputElement).value}`);
    },
    expected: ['{"text":"still here"}', 'field:still here'],
  },
  {
    id: 'evt-a-submit-that-fails-validation-still-resets-a-form-that-asked-to-be-reset',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, jsx('input', { name: 'qty' }), { input: schema({ qty: int() }) }, { reset: true }),
      );
      const stop = listenDoc('janux:error', () => log.push('reported'));

      (pick('[name=qty]') as HTMLInputElement).value = 'twelve';
      fire('.b', 'submit');
      await settle(client);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stop();
      log.push(`field:${(pick('[name=qty]') as HTMLInputElement).value}`);
    },
    expected: ['reported', 'field:'],
  },
  {
    id: 'evt-a-bound-input-on-the-form-element-replaces-the-collected-field-values',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { send: act({ input: schema({ who: str() }), run: ({ input }) => log.push(JSON.stringify(input)) }) },
        view: ({ intents }) =>
          jsx('form', {
            class: 'b',
            onSubmit: (intents as Refs).send.with({ who: 'declared' }),
            children: jsx('input', { name: 'who', value: 'typed' }),
          }),
      });
      const { client } = await serve(def);

      fire('.b', 'submit');
      await settle(client);
    },
    // The submit path collects the form's values; the marker's own
    // `data-input` is not consulted, so the binding never reaches the intent.
    expected: ['{"who":"typed"}'],
  },
  {
    id: 'evt-a-submit-dispatched-from-a-button-inside-the-form-still-collects-the-fields',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(log, [jsx('input', { name: 'who', value: 'jane' }), jsx('button', { class: 'go', type: 'submit' })], {
          input: schema({ who: str() }),
        }),
      );

      pick('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle(client);
    },
    expected: ['{"who":"jane"}'],
  },
  {
    id: 'evt-a-form-with-no-fields-submits-an-empty-object',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(form(log, null, { input: schema({ who: str().default('nobody') }) }));

      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"who":"nobody"}'],
  },
  {
    id: 'evt-a-select-inside-a-form-submits-its-selected-option',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(
        form(
          log,
          jsx('select', {
            name: 'plan',
            children: [jsx('option', { value: 'basic', children: 'Basic' }), jsx('option', { value: 'pro', children: 'Pro' })],
          }),
          { input: schema({ plan: str() }) },
        ),
      );

      (pick('[name=plan]') as HTMLSelectElement).value = 'pro';
      fire('.b', 'submit');
      await settle(client);
    },
    expected: ['{"plan":"pro"}'],
  },
];
