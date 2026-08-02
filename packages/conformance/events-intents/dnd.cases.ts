import { jsx } from 'janux';
import { str, schema } from 'janux/types';
import type { IntentRef } from '../../janux/src/define/types';
import type { ScenarioCase } from '../support/scenario';
import { act, fire, island, listenDoc, pick, serve, settle, text } from './harness';

/**
 * Declarative drag and drop: binding `onDrop` IS the drop zone.
 *
 * The platform only dispatches `drop` on an element whose `dragover` was
 * cancelled, which is why every DnD tutorial starts with a handler that exists
 * solely to call `preventDefault`. The marker already declares the zone, so the
 * runtime does that — in the capture phase, because enabling a declared zone
 * must not depend on page code leaving the event alone.
 *
 * The payload travels in island state (`onDragStart={intents.pick.with(…)}`),
 * not in `dataTransfer`: an agent can invoke the same intents, and it has no
 * drag session to put anything into.
 */

type Refs = Record<string, IntentRef & ((input?: unknown) => Promise<unknown>)>;

/** The canonical board: a draggable card and a column that accepts it. */
function board(log: string[], extra: Record<string, unknown> = {}) {
  return island({
    state: schema({ dragging: str().default('') }),
    intents: {
      pick: act({
        input: schema({ card: str() }),
        run: ({ state, input }) => ((state as { dragging: string }).dragging = (input as { card: string }).card),
      }),
      dropOn: act({
        input: schema({ column: str() }),
        run: ({ state, input }) => log.push(`${(state as { dragging: string }).dragging}→${(input as { column: string }).column}`),
      }),
      release: act({ run: ({ state }) => ((state as { dragging: string }).dragging = '') }),
    },
    view: ({ state, intents }) =>
      jsx('div', {
        children: [
          jsx('article', {
            class: 'card',
            draggable: true,
            onDragStart: (intents as Refs).pick.with({ card: 'bug-7' }),
            onDragEnd: (intents as Refs).release,
          }),
          jsx('section', {
            class: 'col',
            onDrop: (intents as Refs).dropOn.with({ column: 'done' }),
            ...extra,
            children: jsx('span', { class: 'hint', children: 'Drop here' }),
          }),
          jsx('section', { class: 'other', children: 'not a zone' }),
          jsx('output', { children: (state as { dragging: string }).dragging }),
        ],
      }),
  });
}

export const DND_CASES: ScenarioCase[] = [
  {
    id: 'evt-binding-ondrop-emits-the-drop-marker-that-declares-the-zone',
    src: 'janux',
    run: async (log) => {
      const { html } = await serve(board(log));

      log.push(`drop:${html.includes('data-jxe-drop="w#default:dropOn"')}`);
      log.push(`start:${html.includes('data-jxe-dragstart="w#default:pick"')}`);
    },
    expected: ['drop:true', 'start:true'],
  },
  {
    id: 'evt-dragover-is-cancelled-over-a-declared-zone-so-the-browser-will-deliver-the-drop',
    src: 'janux',
    run: async (log) => {
      await serve(board(log));

      log.push(`zone:${fire('.col', 'dragover').defaultPrevented}`);
    },
    expected: ['zone:true'],
  },
  {
    id: 'evt-dragover-is-cancelled-over-the-zones-children-where-the-browser-actually-dispatches',
    src: 'janux',
    run: async (log) => {
      await serve(board(log));

      log.push(`child:${fire('.hint', 'dragover').defaultPrevented}`);
    },
    expected: ['child:true'],
  },
  {
    id: 'evt-dragover-elsewhere-keeps-its-default-so-the-page-is-not-one-big-drop-zone',
    src: 'janux',
    run: async (log) => {
      await serve(board(log));

      log.push(`other:${fire('.other', 'dragover').defaultPrevented}`);
    },
    expected: ['other:false'],
  },
  {
    id: 'evt-page-code-cannot-disable-a-declared-zone-with-stoppropagation',
    src: 'janux',
    run: async (log) => {
      await serve(board(log));

      pick('.col').addEventListener('dragover', (event) => event.stopPropagation());
      log.push(`zone:${fire('.col', 'dragover').defaultPrevented}`);
    },
    expected: ['zone:true'],
  },
  {
    id: 'evt-a-handled-drop-cancels-the-browser-default-so-a-dropped-file-does-not-open-the-page',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      log.push(`prevented:${fire('.col', 'drop').defaultPrevented}`);
      await settle(client);
    },
    expected: ['prevented:true', '→done'],
  },
  {
    id: 'evt-a-drop-outside-any-zone-is-left-to-the-browser',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      log.push(`prevented:${fire('.other', 'drop').defaultPrevented}`);
      await settle(client);
    },
    expected: ['prevented:false'],
  },
  {
    id: 'evt-the-full-gesture-carries-the-payload-through-island-state',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      fire('.card', 'dragstart');
      await settle(client);
      log.push(`holding:${text('output')}`);
      fire('.col', 'dragover');
      fire('.hint', 'drop');
      await settle(client);
    },
    expected: ['holding:bug-7', 'bug-7→done'],
  },
  {
    id: 'evt-dragend-releases-what-the-drag-was-holding',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      fire('.card', 'dragstart');
      await settle(client);
      fire('.card', 'dragend');
      await settle(client);
      log.push(`holding:${JSON.stringify(text('output'))}`);
    },
    expected: ['holding:""'],
  },
  {
    id: 'evt-dropping-on-a-child-of-the-zone-resolves-to-the-zone-itself',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      fire('.hint', 'drop');
      await settle(client);
    },
    expected: ['→done'],
  },
  {
    id: 'evt-nested-zones-hand-the-drop-to-the-innermost-one',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          outer: act({ run: () => log.push('outer') }),
          inner: act({ run: () => log.push('inner') }),
        },
        view: ({ intents }) =>
          jsx('section', {
            class: 'out',
            onDrop: (intents as Refs).outer,
            children: jsx('div', { class: 'in', onDrop: (intents as Refs).inner }),
          }),
      });
      const { client } = await serve(def);

      fire('.in', 'drop');
      await settle(client);
    },
    expected: ['inner'],
  },
  {
    id: 'evt-each-column-of-a-board-is-its-own-zone-with-its-own-bound-input',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          dropOn: act({ input: schema({ column: str() }), run: ({ input }) => log.push((input as { column: string }).column) }),
        },
        view: ({ intents }) =>
          jsx('div', {
            children: ['todo', 'doing', 'done'].map((column) =>
              jsx('section', { class: column, onDrop: (intents as Refs).dropOn.with({ column }) }),
            ),
          }),
      });
      const { client } = await serve(def);

      fire('.doing', 'drop');
      fire('.done', 'drop');
      fire('.todo', 'drop');
      await settle(client);
    },
    expected: ['doing', 'done', 'todo'],
  },
  {
    id: 'evt-dragenter-and-dragleave-are-bubbling-events-so-a-child-crossing-resolves-the-marker',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          enter: act({ run: () => log.push('enter') }),
          leave: act({ run: () => log.push('leave') }),
        },
        view: ({ intents }) =>
          jsx('section', {
            class: 'zone',
            onDragEnter: (intents as Refs).enter,
            onDragLeave: (intents as Refs).leave,
            children: jsx('span', { class: 'inner', children: 'x' }),
          }),
      });
      const { client } = await serve(def);

      fire('.inner', 'dragenter');
      fire('.inner', 'dragleave');
      await settle(client);
    },
    expected: ['enter', 'leave'],
  },
  {
    id: 'evt-a-drag-event-reports-where-the-pointer-was',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { move: act({ input: schema({ x: str().default(''), y: str().default('') }), run: () => log.push('moved') }) },
        view: ({ intents }) => jsx('div', { class: 'z', onDrag: (intents as Refs).move }),
      });
      const { client } = await serve(def);

      pick('.z').dispatchEvent(new MouseEvent('drag', { bubbles: true, clientX: 3, clientY: 4 }));
      await settle(client);
      log.push('done');
    },
    // The coordinates are numbers and this schema declares strings: the
    // mouse facts really do ride along on the drag family.
    expected: ['done'],
  },
  {
    id: 'evt-an-explicit-ondragover-binding-does-not-disable-the-automatic-enabling',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: {
          over: act({ run: () => log.push('over') }),
          drop: act({ run: () => log.push('drop') }),
        },
        view: ({ intents }) => jsx('section', { class: 'z', onDragOver: (intents as Refs).over, onDrop: (intents as Refs).drop }),
      });
      const { client } = await serve(def);

      log.push(`prevented:${fire('.z', 'dragover').defaultPrevented}`);
      await settle(client);
    },
    expected: ['prevented:true', 'over'],
  },
  {
    id: 'evt-binding-only-ondragover-leaves-the-zone-disabled-because-nothing-declared-a-drop',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { over: act({ run: () => log.push('over') }) },
        view: ({ intents }) => jsx('section', { class: 'z', onDragOver: (intents as Refs).over }),
      });
      const { client } = await serve(def);

      log.push(`prevented:${fire('.z', 'dragover').defaultPrevented}`);
      await settle(client);
    },
    expected: ['prevented:false', 'over'],
  },
  {
    id: 'evt-a-zone-a-later-render-created-is-enabled-as-soon-as-it-exists',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ mode: str().default('idle') }),
        intents: {
          start: act({ run: ({ state }) => ((state as { mode: string }).mode = 'dragging') }),
          drop: act({ run: () => log.push('dropped') }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('button', { class: 'go', onClick: (intents as Refs).start }),
              (state as { mode: string }).mode === 'dragging'
                ? jsx('section', { class: 'z', onDrop: (intents as Refs).drop })
                : null,
            ],
          }),
      });
      const { client } = await serve(def);

      fire('.go', 'click');
      await settle(client);
      log.push(`prevented:${fire('.z', 'dragover').defaultPrevented}`);
      fire('.z', 'drop');
      await settle(client);
    },
    expected: ['prevented:true', 'dropped'],
  },
  {
    id: 'evt-removing-the-drop-marker-turns-the-zone-back-off',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      pick('.col').removeAttribute('data-jxe-drop');
      log.push(`prevented:${fire('.col', 'dragover').defaultPrevented}`);
      fire('.col', 'drop');
      await settle(client);
      log.push('quiet');
    },
    expected: ['prevented:false', 'quiet'],
  },
  {
    // Delegation lives on the document, and a detached subtree's events never
    // reach it — so removing the island takes its zone with it, enabling and all.
    id: 'evt-a-zone-whose-island-left-the-document-stops-being-a-zone-at-all',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));
      const zone = pick('.col');

      pick('janux-island[data-jx]').remove();
      const over = new Event('dragover', { bubbles: true, cancelable: true });

      zone.dispatchEvent(over);
      log.push(`prevented:${over.defaultPrevented}`);
      zone.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
      await settle(client);
      log.push('quiet');
    },
    expected: ['prevented:false', 'quiet'],
  },
  {
    id: 'evt-a-drop-with-an-unreadable-bound-input-is-refused-and-reported',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));
      const stop = listenDoc('janux:error', (detail) => log.push(String(detail)));

      pick('.col').setAttribute('data-input', '{"column":');
      fire('.col', 'drop');
      await settle(client);
      stop();
    },
    expected: ['Janux: ignored an event — "data-input" on <section> is not valid JSON'],
  },
  {
    id: 'evt-a-drop-on-a-disabled-control-still-arrives-because-drop-is-not-a-mouse-event',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { drop: act({ run: () => log.push('dropped') }) },
        view: ({ intents }) => jsx('button', { class: 'z', disabled: true, onDrop: (intents as Refs).drop }),
      });
      const { client } = await serve(def);

      fire('.z', 'drop');
      await settle(client);
    },
    expected: ['dropped'],
  },
  {
    id: 'evt-an-agent-can-perform-the-same-move-by-calling-the-two-intents',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      await client.call('w.pick', { card: 'bug-9' });
      await client.call('w.dropOn', { column: 'review' });
      log.push(`holding:${text('output')}`);
    },
    expected: ['bug-9→review', 'holding:bug-9'],
  },
  {
    id: 'evt-a-drag-a-human-started-can-be-finished-by-an-agent-call',
    src: 'janux',
    run: async (log) => {
      const { client } = await serve(board(log));

      fire('.card', 'dragstart');
      await settle(client);
      await client.call('w.dropOn', { column: 'archive' });
    },
    expected: ['bug-7→archive'],
  },
  {
    id: 'evt-two-drops-in-a-row-each-carry-the-card-that-was-picked-up-for-them',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ dragging: str().default('') }),
        intents: {
          pick: act({
            input: schema({ card: str() }),
            run: ({ state, input }) => ((state as { dragging: string }).dragging = (input as { card: string }).card),
          }),
          dropOn: act({
            input: schema({ column: str() }),
            run: ({ state, input }) => log.push(`${(state as { dragging: string }).dragging}→${(input as { column: string }).column}`),
          }),
        },
        view: ({ intents }) =>
          jsx('div', {
            children: [
              jsx('article', { class: 'a', onDragStart: (intents as Refs).pick.with({ card: 'a' }) }),
              jsx('article', { class: 'b', onDragStart: (intents as Refs).pick.with({ card: 'b' }) }),
              jsx('section', { class: 'left', onDrop: (intents as Refs).dropOn.with({ column: 'left' }) }),
              jsx('section', { class: 'right', onDrop: (intents as Refs).dropOn.with({ column: 'right' }) }),
            ],
          }),
      });
      const { client } = await serve(def);

      fire('.a', 'dragstart');
      await settle(client);
      fire('.left', 'drop');
      await settle(client);
      fire('.b', 'dragstart');
      await settle(client);
      fire('.right', 'drop');
      await settle(client);
    },
    expected: ['a→left', 'b→right'],
  },
  {
    id: 'evt-a-drop-zone-inside-another-islands-zone-answers-for-its-own-island',
    src: 'janux',
    run: async (log) => {
      const inner = island({
        name: 'lane',
        intents: { drop: act({ run: () => log.push('lane') }) },
        view: ({ intents }) => jsx('div', { class: 'lane', onDrop: (intents as Refs).drop }),
      });
      const outer = island({
        name: 'boardx',
        intents: { drop: act({ run: () => log.push('board') }) },
        view: ({ intents }) =>
          jsx('section', { class: 'boardx', onDrop: (intents as Refs).drop, children: jsx(inner as never, {}) }),
      });
      const { client } = await serve(outer, { defs: [inner] });

      fire('.lane', 'drop');
      await settle(client);
    },
    expected: ['lane'],
  },
  {
    id: 'evt-the-drop-marker-alone-is-what-enables-a-zone-not-the-elements-tag',
    src: 'janux',
    run: async (log) => {
      const def = island({
        intents: { drop: act({ run: () => log.push('dropped') }) },
        view: ({ intents }) => jsx('span', { class: 'z', onDrop: (intents as Refs).drop }),
      });
      const { client } = await serve(def);

      log.push(`prevented:${fire('.z', 'dragover').defaultPrevented}`);
      fire('.z', 'drop');
      await settle(client);
    },
    expected: ['prevented:true', 'dropped'],
  },
  {
    id: 'evt-a-dragstart-that-fails-validation-leaves-nothing-held',
    src: 'janux',
    run: async (log) => {
      const def = island({
        state: schema({ dragging: str().default('') }),
        intents: {
          pick: act({
            input: schema({ card: str() }),
            run: ({ state, input }) => ((state as { dragging: string }).dragging = (input as { card: string }).card),
          }),
        },
        view: ({ state, intents }) =>
          jsx('div', {
            children: [
              jsx('article', { class: 'card', onDragStart: (intents as Refs).pick, 'data-input': '{"card":42}' }),
              jsx('output', { children: (state as { dragging: string }).dragging }),
            ],
          }),
      });
      const { client } = await serve(def);
      const stop = listenDoc('janux:error', () => log.push('reported'));

      fire('.card', 'dragstart');
      await settle(client);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stop();
      log.push(`holding:${JSON.stringify(text('output'))}`);
    },
    expected: ['reported', 'holding:""'],
  },
];
