import { component, jsx, renderToStream, source } from 'janux';
import { unsuspense, UNSUSPENSE_RUNTIME } from '../../janux/src/render/unsuspense';
import type { ScenarioCase } from '../support/scenario';

/**
 * The browser half of streaming suspense: every boundary chunk calls
 * `jx$u(key, currentScript)` and the pending set (`self.jx$p`) is what makes
 * out-of-order and nested arrival work — a boundary whose host still sits
 * inside another boundary's inert `<template>` stays queued, and every later
 * call sweeps the whole set to a fixpoint. These rows pin the sweep order,
 * the cleanup contract (template consumed, pending attr dropped, stale keys
 * forgotten) and the fragment-move semantics of the swap itself.
 *
 * Templates that must CONTAIN a pending island are built through `.content`
 * explicitly: happy-dom's `insertAdjacentHTML` parses template children as
 * regular (queryable) children, unlike a browser.
 */

function pendingIsland(id: string, inner: string): void {
  document.body.insertAdjacentHTML('beforeend', `<janux-island data-jx="${id}" data-jx-pending>${inner}</janux-island>`);
}

function contentTemplate(id: string, inner: string): HTMLTemplateElement {
  const template = document.createElement('template');

  template.id = `jxu:${id}`;
  template.innerHTML = inner;
  document.body.appendChild(template);

  return template;
}

/** A pending inner island living INSIDE an outer boundary's inert template. */
function nestedPending(outerId: string, innerId: string, fallback: string): void {
  const outerTemplate = document.createElement('template');
  const innerHost = document.createElement('janux-island');

  outerTemplate.id = `jxu:${outerId}`;
  innerHost.setAttribute('data-jx', innerId);
  innerHost.setAttribute('data-jx-pending', '');
  innerHost.innerHTML = fallback;
  outerTemplate.content.appendChild(innerHost);
  document.body.appendChild(outerTemplate);
}

function island(id: string): Element {
  return document.querySelector(`janux-island[data-jx="${id}"]`)!;
}

function pendingSet(): Set<string> {
  return ((self as any).jx$p ??= new Set()) as Set<string>;
}

/** Several timer ticks, so a gated island loses the fallback race deliberately. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve));
}

/**
 * The full loop: streams a page whose gated islands resolve in `releaseOrder`,
 * writes the joined bytes into the live document, then executes each swap
 * script's own text — exactly what the browser's parser would do per chunk.
 */
async function streamedIntoDocument(names: string[], releaseOrder: number[]): Promise<void> {
  const gates = names.map((name) => {
    let release!: (rows: string[]) => void;
    const gate = new Promise<string[]>((resolve) => {
      release = resolve;
    });
    const def = component({
      name,
      sources: { data: source({ query: () => gate }) },
      suspense: () => jsx('p', { children: 'wait' }),
      view: ({ sources }) => jsx('p', { children: `got:${(sources as any).data.value.length}` }),
    });

    return { def, release };
  });
  const { chunks } = renderToStream(jsx('main', { children: gates.map(({ def }) => jsx(def as any, {})) }));
  const collected: string[] = [];
  const drained = (async () => {
    for await (const chunk of chunks) collected.push(chunk);
  })();

  await settle();
  for (const index of releaseOrder) {
    gates[index]!.release(Array.from({ length: index + 1 }, (_, i) => `r${i}`));
    await settle();
  }
  await drained;
  document.body.innerHTML = collected.join('');
  for (const script of [...document.querySelectorAll('script[data-jxu-run]')]) {
    new Function(script.textContent!.replace('document.currentScript', 'null'))();
    script.remove();
  }
}

export const SUSP_CASES: ScenarioCase[] = [
  {
    id: 'susp-a-swap-fills-the-host-and-consumes-the-template',
    src: 'janux',
    run: (log) => {
      pendingIsland('one#default', '<p>wait</p>');
      contentTemplate('one#default', '<p>ready</p>');
      unsuspense('one#default', null);
      log.push(`${island('one#default').innerHTML} pending=${island('one#default').hasAttribute('data-jx-pending')} tpl=${document.getElementById('jxu:one#default') === null}`);
    },
    expected: ['<p>ready</p> pending=false tpl=true'],
  },
  {
    id: 'susp-sibling-boundaries-fill-independently-in-arrival-order',
    src: 'janux',
    run: (log) => {
      pendingIsland('a#1', '<p>w</p>');
      pendingIsland('b#1', '<p>w</p>');
      contentTemplate('b#1', '<p>B</p>');
      unsuspense('b#1', null);
      log.push(`${island('a#1').innerHTML}|${island('b#1').innerHTML}`);
      contentTemplate('a#1', '<p>A</p>');
      unsuspense('a#1', null);
      log.push(`${island('a#1').innerHTML}|${island('b#1').innerHTML}`);
    },
    expected: ['<p>w</p>|<p>B</p>', '<p>A</p>|<p>B</p>'],
  },
  {
    id: 'susp-a-stale-key-with-no-template-is-forgotten',
    src: 'janux',
    run: (log) => {
      unsuspense('gone#1', null);
      log.push(String(pendingSet().size));
    },
    expected: ['0'],
  },
  {
    id: 'susp-a-hostless-boundary-waits-and-any-later-call-sweeps-it-in',
    src: 'janux',
    run: (log) => {
      contentTemplate('waiting#1', '<p>W</p>');
      unsuspense('waiting#1', null);
      log.push(`queued=${pendingSet().has('waiting#1')}`);
      // The host appears later (an outer swap or a diff reveals it)…
      pendingIsland('waiting#1', '<p>fb</p>');
      pendingIsland('other#1', '<p>fb</p>');
      contentTemplate('other#1', '<p>O</p>');
      // …and a DIFFERENT boundary's call completes it: every call sweeps the set.
      unsuspense('other#1', null);
      log.push(`${island('waiting#1').innerHTML}|${island('other#1').innerHTML}`);
    },
    expected: ['queued=true', '<p>W</p>|<p>O</p>'],
  },
  {
    id: 'susp-the-call-script-removes-itself-even-while-the-swap-waits',
    src: 'janux',
    run: (log) => {
      contentTemplate('later#1', '<p>x</p>');
      document.body.insertAdjacentHTML('beforeend', '<script data-jxu-run></script>');
      const script = document.querySelector('script[data-jxu-run]') as HTMLScriptElement;

      unsuspense('later#1', script);
      log.push(`connected=${script.isConnected} queued=${pendingSet().has('later#1')}`);
    },
    expected: ['connected=false queued=true'],
  },
  {
    id: 'susp-a-swap-announces-itself-on-the-document',
    src: 'janux',
    run: (log) => {
      pendingIsland('loud#1', '<p>w</p>');
      contentTemplate('loud#1', '<p>r</p>');
      const heard = (event: Event) => log.push(`heard:${(event as CustomEvent).detail}`);

      document.addEventListener('janux:unsuspense', heard);
      unsuspense('loud#1', null);
      document.removeEventListener('janux:unsuspense', heard);
    },
    expected: ['heard:loud#1'],
  },
  {
    id: 'susp-a-stale-key-never-announces-an-unsuspense',
    src: 'janux',
    run: (log) => {
      const heard = () => log.push('heard');

      document.addEventListener('janux:unsuspense', heard);
      unsuspense('phantom#1', null);
      document.removeEventListener('janux:unsuspense', heard);
      log.push('quiet');
    },
    expected: ['quiet'],
  },
  {
    id: 'susp-an-outer-swap-completes-a-queued-inner-in-the-same-sweep',
    src: 'janux',
    run: (log) => {
      pendingIsland('outer#1', '<p>w</p>');
      nestedPending('outer#1', 'inner#o.1', '<p>w</p>');
      contentTemplate('inner#o.1', '<p>I</p>');
      unsuspense('inner#o.1', null);
      log.push(`inner-visible=${document.querySelector('[data-jx="inner#o.1"]') !== null}`);
      unsuspense('outer#1', null);
      log.push(`${island('inner#o.1').innerHTML} pending=${island('inner#o.1').hasAttribute('data-jx-pending')}`);
    },
    expected: ['inner-visible=false', '<p>I</p> pending=false'],
  },
  {
    id: 'susp-three-levels-resolve-to-a-fixpoint-in-one-call',
    src: 'janux',
    run: (log) => {
      pendingIsland('l1#1', '<p>w</p>');
      nestedPending('l1#1', 'l2#1', '<p>w</p>');
      // level 3 sits inside level 2's template, which itself waits queued.
      const l2Template = document.getElementById('jxu:l2#1');

      if (l2Template) l2Template.remove();
      nestedPending('l2#1', 'l3#1', '<p>w</p>');
      contentTemplate('l3#1', '<p>DEEP</p>');
      unsuspense('l3#1', null);
      unsuspense('l2#1', null);
      log.push(`l3-visible=${document.querySelector('[data-jx="l3#1"]') !== null}`);
      unsuspense('l1#1', null);
      log.push(island('l3#1').innerHTML);
    },
    expected: ['l3-visible=false', '<p>DEEP</p>'],
  },
  {
    id: 'susp-nested-swaps-announce-outer-before-inner',
    src: 'janux',
    run: (log) => {
      pendingIsland('seq-out#1', '<p>w</p>');
      nestedPending('seq-out#1', 'seq-in#1', '<p>w</p>');
      contentTemplate('seq-in#1', '<p>I</p>');
      unsuspense('seq-in#1', null);
      const heard = (event: Event) => log.push((event as CustomEvent).detail as string);

      document.addEventListener('janux:unsuspense', heard);
      unsuspense('seq-out#1', null);
      document.removeEventListener('janux:unsuspense', heard);
    },
    expected: ['seq-out#1', 'seq-in#1'],
  },
  {
    id: 'susp-a-second-call-for-a-swapped-key-is-a-clean-no-op',
    src: 'janux',
    run: (log) => {
      pendingIsland('twice#1', '<p>w</p>');
      contentTemplate('twice#1', '<p>R</p>');
      unsuspense('twice#1', null);
      unsuspense('twice#1', null);
      log.push(`${island('twice#1').innerHTML} queued=${pendingSet().has('twice#1')}`);
    },
    expected: ['<p>R</p> queued=false'],
  },
  {
    id: 'susp-only-a-pending-host-is-ever-filled',
    src: 'janux',
    run: (log) => {
      // A live (already resolved) island with a leftover template: the swap
      // selector requires data-jx-pending, so the content stays untouched.
      document.body.insertAdjacentHTML('beforeend', '<janux-island data-jx="live#1"><p>LIVE</p></janux-island>');
      contentTemplate('live#1', '<p>stale</p>');
      unsuspense('live#1', null);
      log.push(`${island('live#1').innerHTML} queued=${pendingSet().has('live#1')}`);
    },
    expected: ['<p>LIVE</p> queued=true'],
  },
  {
    id: 'susp-the-swap-replaces-every-fallback-child-at-once',
    src: 'janux',
    run: (log) => {
      pendingIsland('multi#1', '<p>skeleton</p><p>shimmer</p><span>dots</span>');
      contentTemplate('multi#1', '<article>done</article>');
      unsuspense('multi#1', null);
      log.push(`${island('multi#1').childNodes.length}:${island('multi#1').innerHTML}`);
    },
    expected: ['1:<article>done</article>'],
  },
  {
    id: 'susp-an-empty-template-swaps-the-island-to-empty',
    src: 'janux',
    run: (log) => {
      // The fail-soft path: a boundary that failed with no error view ships an
      // empty template, and the swap must still clear the fallback.
      pendingIsland('failed#1', '<p>wait</p>');
      contentTemplate('failed#1', '');
      unsuspense('failed#1', null);
      log.push(`"${island('failed#1').innerHTML}" pending=${island('failed#1').hasAttribute('data-jx-pending')}`);
    },
    expected: ['"" pending=false'],
  },
  {
    id: 'susp-the-swap-moves-the-template-nodes-instead-of-cloning-them',
    src: 'janux',
    run: (log) => {
      pendingIsland('move#1', '<p>w</p>');
      const template = contentTemplate('move#1', '<p>moved</p>');
      const original = template.content.firstChild;

      unsuspense('move#1', null);
      log.push(String(island('move#1').firstChild === original));
    },
    expected: ['true'],
  },
  {
    id: 'susp-a-deep-content-tree-lands-intact',
    src: 'janux',
    run: (log) => {
      pendingIsland('deep#1', '<p>w</p>');
      contentTemplate('deep#1', '<section><ul><li>a</li><li>b</li></ul><footer>f</footer></section>');
      unsuspense('deep#1', null);
      log.push(island('deep#1').innerHTML);
    },
    expected: ['<section><ul><li>a</li><li>b</li></ul><footer>f</footer></section>'],
  },
  {
    id: 'susp-a-key-with-the-full-island-charset-round-trips',
    src: 'janux',
    run: (log) => {
      pendingIsland('cart#parent.default.1~fb-2', '<p>w</p>');
      contentTemplate('cart#parent.default.1~fb-2', '<p>C</p>');
      unsuspense('cart#parent.default.1~fb-2', null);
      log.push(island('cart#parent.default.1~fb-2').innerHTML);
    },
    expected: ['<p>C</p>'],
  },
  {
    id: 'susp-a-swap-leaves-unrelated-pending-islands-alone',
    src: 'janux',
    run: (log) => {
      pendingIsland('done#1', '<p>w</p>');
      pendingIsland('still#1', '<p>w</p>');
      contentTemplate('done#1', '<p>D</p>');
      unsuspense('done#1', null);
      log.push(`${island('done#1').innerHTML}|${island('still#1').innerHTML} still-pending=${island('still#1').hasAttribute('data-jx-pending')}`);
    },
    expected: ['<p>D</p>|<p>w</p> still-pending=true'],
  },
  {
    id: 'susp-reinstalling-the-runtime-keeps-the-pending-set',
    src: 'janux',
    run: (log) => {
      // A navigation ships the runtime again on its own first boundary chunk;
      // the reinstall reassigns jx$u but `jx$p ??=` keeps what was queued.
      new Function(UNSUSPENSE_RUNTIME)();
      contentTemplate('carry#1', '<p>C</p>');
      (self as any).jx$u('carry#1', null);
      new Function(UNSUSPENSE_RUNTIME)();
      log.push(`queued=${pendingSet().has('carry#1')}`);
      pendingIsland('carry#1', '<p>w</p>');
      (self as any).jx$u('carry#1', null);
      log.push(island('carry#1').innerHTML);
    },
    expected: ['queued=true', '<p>C</p>'],
  },
  {
    id: 'susp-the-serialized-runtime-swaps-exactly-like-the-module',
    src: 'janux',
    run: (log) => {
      pendingIsland('serial#1', '<p>w</p>');
      contentTemplate('serial#1', '<p>S</p>');
      new Function(UNSUSPENSE_RUNTIME)();
      (self as any).jx$u('serial#1', null);
      log.push(`${island('serial#1').innerHTML} pending=${island('serial#1').hasAttribute('data-jx-pending')}`);
    },
    expected: ['<p>S</p> pending=false'],
  },
  {
    id: 'susp-one-call-sweeps-five-boundaries-that-were-all-waiting',
    src: 'janux',
    run: (log) => {
      const ids = ['s1#1', 's2#1', 's3#1', 's4#1', 's5#1'];

      // All five templates queue hostless; the hosts arrive in one go and a
      // single call (the last chunk's) must complete every one of them.
      ids.forEach((id) => {
        contentTemplate(id, `<p>${id}</p>`);
        unsuspense(id, null);
      });
      ids.forEach((id) => pendingIsland(id, '<p>w</p>'));
      unsuspense(ids[4]!, null);
      log.push(ids.map((id) => island(id).innerHTML).join('|'));
      log.push(String(pendingSet().size));
    },
    expected: ['<p>s1#1</p>|<p>s2#1</p>|<p>s3#1</p>|<p>s4#1</p>|<p>s5#1</p>', '0'],
  },
  {
    id: 'susp-a-repeat-call-for-the-same-key-completes-it-once-the-host-exists',
    src: 'janux',
    run: (log) => {
      contentTemplate('retry#1', '<p>R</p>');
      unsuspense('retry#1', null);
      pendingIsland('retry#1', '<p>w</p>');
      unsuspense('retry#1', null);
      log.push(`${island('retry#1').innerHTML} queued=${pendingSet().has('retry#1')}`);
    },
    expected: ['<p>R</p> queued=false'],
  },
  {
    id: 'susp-a-template-arriving-after-its-host-swaps-on-its-own-call',
    src: 'janux',
    run: (log) => {
      pendingIsland('flip#1', '<p>w</p>');
      contentTemplate('flip#1', '<p>F</p>');
      unsuspense('flip#1', null);
      log.push(island('flip#1').innerHTML);
    },
    expected: ['<p>F</p>'],
  },
  {
    id: 'susp-a-pending-host-nested-deep-in-the-page-is-still-found',
    src: 'janux',
    run: (log) => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<main><section><div><janux-island data-jx="deep-host#1" data-jx-pending><p>w</p></janux-island></div></section></main>',
      );
      contentTemplate('deep-host#1', '<p>D</p>');
      unsuspense('deep-host#1', null);
      log.push(island('deep-host#1').innerHTML);
    },
    expected: ['<p>D</p>'],
  },
  {
    id: 'susp-each-boundary-consumes-only-its-own-template',
    src: 'janux',
    run: (log) => {
      pendingIsland('own-a#1', '<p>w</p>');
      pendingIsland('own-b#1', '<p>w</p>');
      contentTemplate('own-a#1', '<p>A</p>');
      contentTemplate('own-b#1', '<p>B</p>');
      unsuspense('own-a#1', null);
      log.push(`b-template-intact=${document.getElementById('jxu:own-b#1') !== null}`);
      unsuspense('own-b#1', null);
      log.push(`${island('own-a#1').innerHTML}|${island('own-b#1').innerHTML}`);
    },
    expected: ['b-template-intact=true', '<p>A</p>|<p>B</p>'],
  },
  {
    id: 'susp-end-to-end-a-streamed-boundary-swaps-through-its-own-script',
    src: 'janux',
    run: async (log) => {
      await streamedIntoDocument(['e2e-solo'], [0]);
      const host = island('e2e-solo#default');

      log.push(`${host.innerHTML} pending=${host.hasAttribute('data-jx-pending')} tpl=${document.getElementById('jxu:e2e-solo#default') === null}`);
    },
    expected: ['<p>got:1</p> pending=false tpl=true'],
  },
  {
    id: 'susp-end-to-end-reverse-resolution-order-still-fills-both-slots',
    src: 'janux',
    run: async (log) => {
      await streamedIntoDocument(['e2e-first', 'e2e-second'], [1, 0]);
      log.push(`${island('e2e-first#default').innerHTML}|${island('e2e-second#default').innerHTML}`);
      log.push(String(pendingSet().size));
    },
    expected: ['<p>got:1</p>|<p>got:2</p>', '0'],
  },
  {
    id: 'susp-end-to-end-the-sentinel-is-all-a-settled-boundary-leaves-behind',
    src: 'janux',
    run: async (log) => {
      await streamedIntoDocument(['e2e-clean'], [0]);
      const leftovers = [...document.querySelectorAll('template')].map((template) => template.getAttribute('key'));

      log.push(JSON.stringify(leftovers));
    },
    expected: ['["jxq:e2e-clean#default"]'],
  },
];
