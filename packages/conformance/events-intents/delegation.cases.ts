import { jsx } from 'janux';
import { bool, int, schema, str } from 'janux/types';
import { ensureListener, ensureListenerForAttr, scanTree } from '../../janux/src/client/events';
import type { IntentRef } from '../../janux/src/define/types';
import type { ScenarioCase } from '../support/scenario';
import { act, fire, island, listenDoc, pick, reboot, serve, settle, text } from './harness';

/**
 * Delegation: one document-level listener per event type, resolving a marker
 * back to the island that owns it.
 *
 * The rows here pin what a dispatch *reaches* — ordering, resolution, refusal —
 * and the DOM the page ends up with. They never pin how many render passes
 * produced that DOM: a burst of events may be coalesced into one.
 */

type Refs = Record<string, IntentRef & ((input?: unknown) => Promise<unknown>)>;

/** Counts `document.addEventListener` calls per type while `work` runs. */
async function countListeners(work: () => Promise<void>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const original = document.addEventListener.bind(document);

  (document as { addEventListener: unknown }).addEventListener = (type: string, ...rest: unknown[]) => {
    counts[type] = (counts[type] ?? 0) + 1;

    return (original as (...args: unknown[]) => unknown)(type, ...rest);
  };
  try {
    await work();
  } finally {
    (document as { addEventListener: unknown }).addEventListener = original;
  }

  return counts;
}

/** A one-button island whose intent records that it ran. */
function button(log: string[], prop: string, extra: Record<string, unknown> = {}) {
  return island({
    intents: { go: act({ run: () => log.push('ran') }) },
    view: ({ intents }) => jsx('button', { class: 'b', [prop]: (intents as Refs).go, ...extra }),
  });
}

export const DELEGATION_CASES: ScenarioCase[] = [
  // ── listener registration ──────────────────────────────────────────────────
  {
    id: 'evt-a-type-gets-one-capture-listener-and-one-bubble-listener-not-more',
    src: 'janux',
    run: async (log) => {
      const counts = await countListeners(async () => {
        ensureListener('regonce');
        ensureListener('regonce');
        ensureListener('regonce');
      });

      log.push(`installed:${counts.regonce}`);
    },
    expected: ['installed:2'],
  },
  {
    id: 'evt-the-listener-for-a-type-is-installed-from-the-marker-attribute-name',
    src: 'janux',
    run: async (log) => {
      const counts = await countListeners(async () => {
        ensureListenerForAttr('data-jxe-regattr');
      });

      log.push(`installed:${counts.regattr}`);
    },
    expected: ['installed:2'],
  },
  {
    id: 'evt-an-attribute-that-is-not-a-marker-installs-nothing',
    src: 'janux',
    run: async (log) => {
      const counts = await countListeners(async () => {
        ensureListenerForAttr('class');
        ensureListenerForAttr('data-input');
        ensureListenerForAttr('data-jx');
      });

      log.push(`types:${Object.keys(counts).length}`);
    },
    expected: ['types:0'],
  },
  {
    id: 'evt-scanning-a-freshly-inserted-subtree-installs-what-its-markers-need',
    src: 'janux',
    run: async (log) => {
      const host = document.createElement('div');

      host.innerHTML = '<p><span data-jxe-regscan="w#default:go"></span></p>';
      const counts = await countListeners(async () => scanTree(host));

      log.push(`installed:${counts.regscan}`);
    },
    expected: ['installed:2'],
  },
  {
    id: 'evt-scanning-a-subtree-also-looks-at-the-root-element-itself',
    src: 'janux',
    run: async (log) => {
      const host = document.createElement('div');

      host.setAttribute('data-jxe-regroot', 'w#default:go');
      const counts = await countListeners(async () => scanTree(host));

      log.push(`installed:${counts.regroot}`);
    },
    expected: ['installed:2'],
  },
  {
    id: 'evt-booting-a-page-installs-the-listeners-its-ssr-markers-ask-for',
    src: 'janux',
    run: async (log) => {
      const counts = await countListeners(async () => {
        await serve(button(log, 'onRegboot'));
      });

      log.push(`installed:${counts.regboot}`);
    },
    expected: ['installed:2'],
  },
  {
    id: 'evt-a-second-boot-of-the-same-document-does-not-invoke-the-intent-twice',
    src: 'janux',
    run: async (log) => {
      const def = button(log, 'onClick');
      const { client } = await serve(def);
      const second = reboot(def);

      fire('.b', 'click');
      await settle(second);
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-marker-a-client-render-creates-later-still-gets-its-listener',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ armed: bool().default(false) }),
        intents: {
          arm: act({ run: ({ state }) => ((state as { armed: boolean }).armed = true) }),
          spin: act({ run: () => log.push('spun') }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'arm', onClick: (intents as Refs).arm }),
              (state as { armed: boolean }).armed
                ? jsx('div', { class: 'pad', onLatewheel: (intents as Refs).spin })
                : null,
            ],
          }),
      });
      const { client } = await serve(def);

      log.push(`before:${document.querySelector('.pad') === null}`);
      fire('.arm', 'click');
      await settle(client);
      fire('.pad', 'latewheel');
      await settle(client);
    },
    expected: ['before:true', 'spun'],
  },

  // ── resolving a marker ─────────────────────────────────────────────────────
  {
    id: 'evt-a-click-on-the-marked-element-invokes-its-intent',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));

      fire('.b', 'click');
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-click-on-a-descendant-resolves-to-the-nearest-marked-ancestor',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) =>
          jsx('button', { class: 'b', onClick: (intents as Refs).go, children: jsx('span', { class: 'label', children: 'go' }) }),
      });
      const { client } = await serve(def);

      fire('.label', 'click');
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-nested-markers-of-the-same-type-resolve-to-the-innermost-one',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          outer: act({ run: () => log.push('outer') }),
          inner: act({ run: () => log.push('inner') }),
        },
        view: ({ intents }) =>
          jsx('div', {
            onClick: (intents as Refs).outer,
            children: jsx('button', { class: 'inner', onClick: (intents as Refs).inner }),
          }),
      });
      const { client } = await serve(def);

      fire('.inner', 'click');
      await settle(client);
    },
    expected: ['inner'],
  },
  {
    id: 'evt-a-click-elsewhere-in-the-page-resolves-nothing',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const outside = document.createElement('button');

      document.body.append(outside);
      outside.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-a-marker-that-lives-outside-any-island-is-not-invocable',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const stray = document.createElement('button');

      stray.setAttribute('data-jxa', 'w#default:go');
      document.body.append(stray);
      stray.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-a-marked-element-detached-from-its-island-stops-resolving',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const target = pick('.b');

      pick('janux-island[data-jx]').remove();
      target.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-an-element-removed-mid-dispatch-by-page-code-no-longer-resolves',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const target = pick('.b');

      // A page listener runs first and takes the element out of the tree; the
      // delegated listener then has no island to resolve against.
      target.addEventListener('click', () => target.remove());
      target.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-an-unknown-intent-name-in-a-marker-is-a-no-op-not-a-crash',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const stop = listenDoc('janux:error', (detail) => log.push(`error:${String(detail)}`));

      pick('.b').setAttribute('data-jxa', 'w#default:nosuchintent');
      fire('.b', 'click');
      await settle(client);
      stop();
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-a-marker-naming-an-island-the-page-does-not-know-reports-on-the-error-channel',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const stop = listenDoc('janux:error', (detail) => log.push(`error:${String(detail)}`));

      pick('.b').setAttribute('data-jxa', 'ghost#default:go');
      fire('.b', 'click');
      await settle(client);
      await Promise.resolve();
      stop();
    },
    expected: ['error:Error: Janux: unknown island "ghost" (no loader registered)'],
  },
  {
    id: 'evt-two-islands-each-answer-their-own-markers',
    src: 'janux',
    run: async (log) => {
      const left = island({
        name: 'left',
        intents: { go: act({ run: () => log.push('left') }) },
        view: ({ intents }) => jsx('button', { class: 'l', onClick: (intents as Refs).go }),
      });
      const right = island({
        name: 'right',
        intents: { go: act({ run: () => log.push('right') }) },
        view: ({ intents }) => jsx('button', { class: 'r', onClick: (intents as Refs).go }),
      });
      const shell = island({
        name: 'shell',
        view: () => jsx('div', { children: [jsx(left as never, {}), jsx(right as never, {})] }),
      });
      const { client } = await serve(shell, { defs: [left, right] });

      fire('.r', 'click');
      fire('.l', 'click');
      await settle(client);
    },
    expected: ['right', 'left'],
  },
  {
    id: 'evt-a-nested-island-answers-its-own-click-not-its-parents',
    src: 'janux',
    run: async (log) => {
      const inner = island({
        name: 'inner',
        intents: { hit: act({ run: () => log.push('inner') }) },
        view: ({ intents }) => jsx('button', { class: 'i', onClick: (intents as Refs).hit }),
      });
      const outer = island({
        name: 'outer',
        intents: { hit: act({ run: () => log.push('outer') }) },
        view: ({ intents }) => jsx('div', { onClick: (intents as Refs).hit, children: jsx(inner as never, {}) }),
      });
      const { client } = await serve(outer, { defs: [inner] });

      fire('.i', 'click');
      await settle(client);
    },
    expected: ['inner'],
  },

  // ── phases ─────────────────────────────────────────────────────────────────
  {
    id: 'evt-page-code-can-suppress-a-bubbling-delegated-event-with-stoppropagation',
    src: 'preact:events#stopPropagation',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));

      pick('.b').addEventListener('click', (event) => event.stopPropagation());
      fire('.b', 'click');
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-stoppropagation-on-a-non-bubbling-event-cannot-suppress-it-the-capture-lane-already-saw-it',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('div', { class: 'b', onMouseEnter: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      pick('.b').addEventListener('mouseenter', (event) => event.stopPropagation());
      fire('.b', 'mouseenter', { bubbles: false });
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-non-bubbling-event-is-delegated-through-the-capture-phase',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('div', { class: 'b', onScroll: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'scroll', { bubbles: false });
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-one-dispatch-of-a-bubbling-event-invokes-once-not-once-per-lane',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('div', { class: 'b', onWheel: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'wheel');
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-toggle-event-reaches-its-intent-although-it-does-not-bubble',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('details', { class: 'b', onToggle: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'toggle', { bubbles: false });
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-mouseenter-fires-for-the-marked-element-and-never-for-its-children',
    src: 'react:enter-leave#one-per-element',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('enter') }) },
        view: ({ intents }) =>
          jsx('div', { class: 'card', onMouseEnter: (intents as Refs).go, children: jsx('span', { class: 'inner', children: 'x' }) }),
      });
      const { client } = await serve(def);

      fire('.card', 'mouseenter', { bubbles: false });
      fire('.inner', 'mouseenter', { bubbles: false });
      await settle(client);
    },
    expected: ['enter'],
  },
  {
    id: 'evt-mouseleave-follows-the-same-per-element-rule-as-mouseenter',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('leave') }) },
        view: ({ intents }) =>
          jsx('div', { class: 'card', onMouseLeave: (intents as Refs).go, children: jsx('span', { class: 'inner', children: 'x' }) }),
      });
      const { client } = await serve(def);

      fire('.inner', 'mouseleave', { bubbles: false });
      fire('.card', 'mouseleave', { bubbles: false });
      await settle(client);
    },
    expected: ['leave'],
  },
  {
    id: 'evt-pointerenter-obeys-the-same-rule-as-its-mouse-counterpart',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('enter') }) },
        view: ({ intents }) =>
          jsx('div', { class: 'card', onPointerEnter: (intents as Refs).go, children: jsx('span', { class: 'inner', children: 'x' }) }),
      });
      const { client } = await serve(def);

      fire('.inner', 'pointerenter', { bubbles: false });
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-a-non-enter-event-on-a-child-still-resolves-through-closest',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('over') }) },
        view: ({ intents }) =>
          jsx('div', { class: 'card', onMouseOver: (intents as Refs).go, children: jsx('span', { class: 'inner', children: 'x' }) }),
      });
      const { client } = await serve(def);

      fire('.inner', 'mouseover');
      await settle(client);
    },
    expected: ['over'],
  },

  // ── platform defaults ──────────────────────────────────────────────────────
  {
    id: 'evt-a-marked-click-cancels-the-browser-default',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick'));
      const event = fire('.b', 'click');

      await settle(client);
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['ran', 'prevented:true'],
  },
  {
    id: 'evt-a-marked-anchor-does-not-navigate',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('a', { class: 'b', href: '/elsewhere', onClick: (intents as Refs).go }),
      });
      const { client } = await serve(def);
      const event = fire('.b', 'click');

      await settle(client);
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['ran', 'prevented:true'],
  },
  {
    id: 'evt-an-unmarked-click-inside-an-island-keeps-its-default',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) =>
          jsx('div', { children: [jsx('button', { class: 'b', onClick: (intents as Refs).go }), jsx('a', { class: 'plain', href: '/x' })] }),
      });
      const { client } = await serve(def);
      const event = fire('.plain', 'click');

      await settle(client);
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['prevented:false'],
  },
  {
    id: 'evt-a-marked-submit-cancels-the-form-post',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { send: act({ run: () => log.push('sent') }) },
        view: ({ intents }) => jsx('form', { class: 'b', onSubmit: (intents as Refs).send }),
      });
      const { client } = await serve(def);
      const event = fire('.b', 'submit');

      await settle(client);
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['sent', 'prevented:true'],
  },
  {
    id: 'evt-a-rich-event-is-observed-without-cancelling-its-default',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('div', { class: 'b', onWheel: (intents as Refs).go }),
      });
      const { client } = await serve(def);
      const event = fire('.b', 'wheel');

      await settle(client);
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['ran', 'prevented:false'],
  },

  // ── disabled controls ──────────────────────────────────────────────────────
  {
    id: 'evt-a-click-on-a-disabled-button-never-reaches-the-intent',
    src: 'react:DOMPluginEventSystem#shouldPreventMouseEvent',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { disabled: true }));

      fire('.b', 'click');
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-a-disabled-marked-button-does-not-even-get-its-default-cancelled',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { disabled: true }));
      const event = fire('.b', 'click');

      await settle(client);
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['prevented:false'],
  },
  {
    id: 'evt-a-pointerdown-on-a-disabled-control-is-suppressed-too',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('button', { class: 'b', disabled: true, onPointerDown: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'pointerdown');
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-a-keydown-on-a-disabled-control-is-not-a-mouse-event-and-still-arrives',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('button', { class: 'b', disabled: true, onKeyDown: (intents as Refs).go }),
      });
      const { client } = await serve(def);

      fire('.b', 'keydown');
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-click-on-a-child-of-a-disabled-fieldset-is-suppressed',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) =>
          jsx('fieldset', { disabled: true, children: jsx('button', { class: 'b', onClick: (intents as Refs).go }) }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'evt-re-enabling-a-control-makes-its-marker-live-again',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { disabled: true }));

      fire('.b', 'click');
      await settle(client);
      pick('.b').removeAttribute('disabled');
      fire('.b', 'click');
      await settle(client);
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-disabled-control-cannot-be-driven-by-a-programmatic-click-either',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { disabled: true }));

      (pick('.b') as HTMLButtonElement).click();
      await settle(client);
      log.push('quiet');
    },
    expected: ['quiet'],
  },

  // ── a marker whose input cannot be read ────────────────────────────────────
  {
    id: 'evt-a-data-input-that-is-not-json-refuses-the-click-and-reports-it',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { 'data-input': '{oops' }));
      const stop = listenDoc('janux:error', (detail) => log.push(String(detail)));

      fire('.b', 'click');
      await settle(client);
      stop();
    },
    expected: ['Janux: ignored an event — "data-input" on <button> is not valid JSON'],
  },
  {
    id: 'evt-a-broken-data-input-does-not-take-the-delegation-pass-down-with-it',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          bad: act({ run: () => log.push('bad') }),
          good: act({ run: () => log.push('good') }),
        },
        view: ({ intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'bad', onClick: (intents as Refs).bad, 'data-input': 'not json' }),
              jsx('button', { class: 'good', onClick: (intents as Refs).good }),
            ],
          }),
      });
      const { client } = await serve(def);
      const stop = listenDoc('janux:error', () => log.push('reported'));

      fire('.bad', 'click');
      fire('.good', 'click');
      await settle(client);
      stop();
    },
    expected: ['reported', 'good'],
  },
  {
    id: 'evt-a-broken-data-input-on-a-rich-event-is-refused-the-same-way',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { go: act({ run: () => log.push('ran') }) },
        view: ({ intents }) => jsx('div', { class: 'b', onWheel: (intents as Refs).go, 'data-input': '[1,' }),
      });
      const { client } = await serve(def);
      const stop = listenDoc('janux:error', () => log.push('reported'));

      fire('.b', 'wheel');
      await settle(client);
      stop();
    },
    expected: ['reported'],
  },
  {
    id: 'evt-an-empty-data-input-means-no-input-not-a-broken-one',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { 'data-input': '' }));
      const stop = listenDoc('janux:error', () => log.push('reported'));

      fire('.b', 'click');
      await settle(client);
      stop();
    },
    expected: ['ran'],
  },
  {
    id: 'evt-a-refused-click-still-cancels-the-default-because-the-marker-claimed-it',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(button(log, 'onClick', { 'data-input': '{' }));
      const stop = listenDoc('janux:error', () => undefined);
      const event = fire('.b', 'click');

      await settle(client);
      stop();
      log.push(`prevented:${event.defaultPrevented}`);
    },
    expected: ['prevented:true'],
  },

  // ── ordering and the DOM a burst leaves behind ─────────────────────────────
  {
    id: 'evt-two-clicks-on-different-elements-run-in-dispatch-order',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          a: act({ run: () => log.push('a') }),
          b: act({ run: () => log.push('b') }),
        },
        view: ({ intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'one', onClick: (intents as Refs).a }),
              jsx('button', { class: 'two', onClick: (intents as Refs).b }),
            ],
          }),
      });
      const { client } = await serve(def);

      fire('.two', 'click');
      fire('.one', 'click');
      fire('.two', 'click');
      await settle(client);
    },
    expected: ['b', 'a', 'b'],
  },
  {
    id: 'evt-a-burst-of-clicks-leaves-the-dom-showing-every-one-of-them',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        intents: { bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('button', { class: 'b', onClick: (intents as Refs).bump, children: `n=${(state as { n: number }).n}` }),
      });
      const { client } = await serve(def);

      Array.from({ length: 25 }, () => fire('.b', 'click'));
      await settle(client);
      log.push(text('.b'));
    },
    expected: ['n=25'],
  },
  {
    id: 'evt-a-mixed-burst-across-two-islands-leaves-both-doms-correct',
    src: 'janux',
    run: async (log) => {
      const counter = island({
        name: 'counter',
        state: schema({ n: int().default(0) }),
        intents: { bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('button', { class: 'c', onClick: (intents as Refs).bump, children: `${(state as { n: number }).n}` }),
      });
      const label = island({
        name: 'label',
        state: schema({ hits: int().default(0) }),
        intents: { hit: act({ run: ({ state }) => ((state as { hits: number }).hits += 1) }) },
        view: ({ state, intents }) =>
          jsx('button', { class: 'l', onClick: (intents as Refs).hit, children: `${(state as { hits: number }).hits}` }),
      });
      const shell = island({
        name: 'shell2',
        view: () => jsx('div', { children: [jsx(counter as never, {}), jsx(label as never, {})] }),
      });
      const { client } = await serve(shell, { defs: [counter, label] });

      Array.from({ length: 5 }, () => fire('.c', 'click'));
      Array.from({ length: 3 }, () => fire('.l', 'click'));
      await settle(client);
      log.push(`c=${text('.c')}`, `l=${text('.l')}`);
    },
    expected: ['c=5', 'l=3'],
  },
  {
    id: 'evt-awaiting-an-agent-call-after-a-click-burst-observes-the-settled-dom',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        intents: { bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('button', { class: 'b', onClick: (intents as Refs).bump, children: `n=${(state as { n: number }).n}` }),
      });
      const { client } = await serve(def);

      Array.from({ length: 3 }, () => fire('.b', 'click'));
      await client.call('w.bump');
      log.push(text('.b'));
    },
    expected: ['n=4'],
  },
  {
    id: 'evt-a-click-that-fails-does-not-stop-the-clicks-that-follow-it',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        intents: {
          boom: act({ run: () => { throw new Error('nope'); } }),
          bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'boom', onClick: (intents as Refs).boom }),
              jsx('button', { class: 'bump', onClick: (intents as Refs).bump }),
              jsx('output', { children: `n=${(state as { n: number }).n}` }),
            ],
          }),
      });
      const { client } = await serve(def);

      fire('.boom', 'click');
      fire('.bump', 'click');
      fire('.bump', 'click');
      await settle(client);
      log.push(text('output'));
    },
    expected: ['n=2'],
  },
  {
    id: 'evt-a-failing-click-is-reported-on-the-error-channel',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { boom: act({ run: () => { throw new Error('card declined'); } }) },
        view: ({ intents }) => jsx('button', { class: 'b', onClick: (intents as Refs).boom }),
      });
      const { client } = await serve(def);
      const stop = listenDoc('janux:error', (detail) => log.push(String(detail)));

      fire('.b', 'click');
      await settle(client);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stop();
    },
    expected: ['Error: card declined'],
  },
  {
    id: 'evt-clicking-twice-before-the-island-has-mounted-mounts-it-once-and-runs-both',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        lifecycle: { attach: () => void log.push('attach') },
        intents: { bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('button', { class: 'b', onClick: (intents as Refs).bump, children: `n=${(state as { n: number }).n}` }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      fire('.b', 'click');
      await settle(client);
      log.push(text('.b'));
    },
    expected: ['attach', 'n=2'],
  },
  {
    id: 'evt-a-click-after-the-island-was-disposed-mounts-it-again-from-its-declared-defaults',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ n: int().default(0) }),
        intents: { bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }) },
        view: ({ state, intents }) =>
          jsx('button', { class: 'b', onClick: (intents as Refs).bump, children: `n=${(state as { n: number }).n}` }),
      });
      const { client } = await serve(def);

      fire('.b', 'click');
      await settle(client);
      log.push(`first:${text('.b')}`);
      await (await client.mount('w#default') as { dispose: () => Promise<void> }).dispose();
      fire('.b', 'click');
      await settle(client);
      log.push(`second:${text('.b')}`);
    },
    expected: ['first:n=1', 'second:n=1'],
  },
  {
    id: 'evt-a-marked-element-that-a-render-replaced-keeps-answering-clicks',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ label: str().default('one'), n: int().default(0) }),
        intents: {
          rename: act({ run: ({ state }) => ((state as { label: string }).label = 'two') }),
          bump: act({ run: ({ state }) => ((state as { n: number }).n += 1) }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'rename', onClick: (intents as Refs).rename }),
              jsx('button', { class: 'bump', onClick: (intents as Refs).bump, children: (state as { label: string }).label }),
              jsx('output', { children: `n=${(state as { n: number }).n}` }),
            ],
          }),
      });
      const { client } = await serve(def);

      fire('.rename', 'click');
      await settle(client);
      log.push(text('.bump'));
      fire('.bump', 'click');
      await settle(client);
      log.push(text('output'));
    },
    expected: ['two', 'n=1'],
  },
];
