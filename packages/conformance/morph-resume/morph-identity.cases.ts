import { setNodeKey } from '../../janux/src/client/keys';
import { morph } from '../../janux/src/client/morph';
import type { ScenarioCase } from '../support/scenario';

/**
 * What in-place patching actually buys: the LIVE NODES survive. Listeners,
 * expando properties, focus and key stamps all live on node instances, so a
 * patcher that produces the right markup with fresh nodes still breaks the
 * page. These rows assert instance identity directly, plus the multi-morph
 * sequences (a→b→a, adopt-then-reorder) where identity has to hold over time.
 */

function attached(markup: string): Element {
  const host = document.createElement('div');

  host.innerHTML = markup;
  document.body.append(host);

  return host;
}

/** Morphs `root` towards `markup`, stamping `keys` on the incoming children in order. */
function morphInto(root: Element, markup: string, keys: Array<string | null> = []): void {
  const holder = document.createElement('div');

  holder.innerHTML = markup;
  [...holder.children].forEach((child, index) => {
    const key = keys[index];

    if (key !== null && key !== undefined) setNodeKey(child, key);
  });
  morph(root, [...holder.childNodes]);
}

export const MORPH_IDENTITY_CASES: ScenarioCase[] = [
  {
    id: 'morph-reuses-the-element-instance-across-a-text-update',
    src: 'morphdom:core#reuse',
    run: (log) => {
      const host = attached('<p>old</p>');
      const before = host.firstChild;

      morphInto(host, '<p>new</p>');
      log.push(`same=${host.firstChild === before} text=${host.firstChild!.textContent}`);
    },
    expected: ['same=true text=new'],
  },
  {
    id: 'morph-reuses-the-text-node-instance-when-its-data-changes',
    src: 'janux',
    run: (log) => {
      const host = attached('<p>old</p>');
      const textNode = host.firstChild!.firstChild;

      morphInto(host, '<p>new</p>');
      log.push(`same=${host.firstChild!.firstChild === textNode}`);
    },
    expected: ['same=true'],
  },
  {
    id: 'morph-reuses-the-comment-node-instance-when-its-data-changes',
    src: 'janux',
    run: (log) => {
      const host = attached('<!--v1-->');
      const comment = host.firstChild;

      morphInto(host, '<!--v2-->');
      log.push(`same=${host.firstChild === comment} data=${host.firstChild!.textContent}`);
    },
    expected: ['same=true data=v2'],
  },
  {
    id: 'morph-an-attr-only-change-keeps-every-descendant-instance',
    src: 'janux',
    run: (log) => {
      const host = attached('<div class="a"><ul><li>deep</li></ul></div>');
      const leaf = host.querySelector('li');

      morphInto(host, '<div class="b"><ul><li>deep</li></ul></div>');
      log.push(`same=${host.querySelector('li') === leaf}`);
    },
    expected: ['same=true'],
  },
  {
    id: 'morph-a-tag-change-produces-a-fresh-instance',
    src: 'janux',
    run: (log) => {
      const host = attached('<p>x</p>');
      const before = host.firstChild;

      morphInto(host, '<span>x</span>');
      log.push(`same=${host.firstChild === before}`);
    },
    expected: ['same=false'],
  },
  {
    id: 'morph-an-island-host-instance-survives-an-ignored-content-change',
    src: 'janux',
    run: (log) => {
      const host = attached('<janux-island data-jx="w#1"><p>live</p></janux-island>');
      const islandHost = host.firstChild;

      morphInto(host, '<janux-island data-jx="w#1"><p>server</p></janux-island>');
      log.push(`same=${host.firstChild === islandHost}`);
    },
    expected: ['same=true'],
  },
  {
    id: 'morph-index-matching-rewrites-in-place-instead-of-shifting-nodes',
    src: 'preact:keys#unkeyed-in-place',
    run: (log) => {
      // Without keys, removing the head child REUSES the first node and
      // rewrites its text — the identity cost keys exist to avoid.
      const host = attached('<p>a</p><p>b</p>');
      const first = host.firstChild;

      morphInto(host, '<p>b</p>');
      log.push(`reused-first=${host.firstChild === first} text=${host.firstChild!.textContent}`);
    },
    expected: ['reused-first=true text=b'],
  },
  {
    id: 'morph-a-listener-keeps-firing-on-a-reused-node',
    src: 'morphdom:core#listeners',
    run: (log) => {
      const host = attached('<button>old</button>');
      const button = host.firstChild as HTMLElement;

      button.addEventListener('click', () => log.push('clicked'));
      morphInto(host, '<button>new</button>');
      (host.firstChild as HTMLElement).click();
      log.push(host.firstChild!.textContent!);
    },
    expected: ['clicked', 'new'],
  },
  {
    id: 'morph-a-listener-dies-with-a-tag-replacement',
    src: 'janux',
    run: (log) => {
      const host = attached('<button>x</button>');

      (host.firstChild as HTMLElement).addEventListener('click', () => log.push('clicked'));
      morphInto(host, '<a>x</a>');
      (host.firstChild as HTMLElement).click();
      log.push('done');
    },
    expected: ['done'],
  },
  {
    id: 'morph-an-expando-property-survives-a-reuse',
    src: 'janux',
    run: (log) => {
      const host = attached('<p>x</p>');

      (host.firstChild as any).__mounted = 42;
      morphInto(host, '<p class="y">x</p>');
      log.push(String((host.firstChild as any).__mounted));
    },
    expected: ['42'],
  },
  {
    id: 'morph-focus-stays-on-a-node-whose-attributes-sync',
    src: 'janux',
    run: (log) => {
      const host = attached('<button>go</button>');
      const button = host.firstChild as HTMLElement;

      button.focus();
      morphInto(host, '<button aria-busy="true">go</button>');
      log.push(`focused=${document.activeElement === button} busy=${button.getAttribute('aria-busy')}`);
    },
    expected: ['focused=true busy=true'],
  },
  {
    id: 'morph-a-round-trip-restores-the-markup-on-the-same-nodes',
    src: 'janux',
    run: (log) => {
      const host = attached('<p class="a">one</p><span>two</span>');
      const [p, span] = [...host.childNodes];

      morphInto(host, '<p class="b">uno</p><span>dos</span>');
      morphInto(host, '<p class="a">one</p><span>two</span>');
      log.push(`${host.innerHTML} same=${host.childNodes[0] === p && host.childNodes[1] === span}`);
    },
    expected: ['<p class="a">one</p><span>two</span> same=true'],
  },
  {
    id: 'morph-applying-the-same-target-twice-is-idempotent',
    src: 'janux',
    run: (log) => {
      const host = attached('<ul><li>a</li></ul>');

      morphInto(host, '<ul><li>a</li><li>b</li></ul>');
      const after = [...host.querySelectorAll('li')];

      morphInto(host, '<ul><li>a</li><li>b</li></ul>');
      log.push(`${host.innerHTML} same=${[...host.querySelectorAll('li')].every((li, i) => li === after[i])}`);
    },
    expected: ['<ul><li>a</li><li>b</li></ul> same=true'],
  },
  {
    id: 'morph-a-runtime-class-survives-two-successive-morphs',
    src: 'janux',
    run: (log) => {
      const host = attached('<p class="janux-glow">x</p>');

      morphInto(host, '<p class="v1">x</p>');
      morphInto(host, '<p class="v2">x</p>');
      log.push((host.firstChild as Element).getAttribute('class')!);
    },
    expected: ['v2 janux-glow'],
  },
  {
    id: 'morph-adopted-keys-move-the-original-ssr-nodes-on-the-next-render',
    src: 'qwik:resumability#adopt-then-reorder',
    run: (log) => {
      // The resume story in two acts: the first client render adopts keys onto
      // the SSR nodes by position; the second render reorders — and it is the
      // ORIGINAL nodes that move.
      const host = attached('<li>a</li><li>b</li>');
      const [a, b] = [...host.childNodes];

      morphInto(host, '<li>a</li><li>b</li>', ['a', 'b']);
      morphInto(host, '<li>b</li><li>a</li>', ['b', 'a']);
      log.push(`${host.innerHTML} moved=${host.childNodes[0] === b && host.childNodes[1] === a}`);
    },
    expected: ['<li>b</li><li>a</li> moved=true'],
  },
  {
    id: 'morph-an-island-instance-outlives-three-renders-of-its-siblings',
    src: 'janux',
    run: (log) => {
      const host = attached('<p>v0</p><janux-island data-jx="w#1">LIVE</janux-island>');
      const islandHost = host.querySelector('janux-island');

      morphInto(host, '<p>v1</p><janux-island data-jx="w#1">s1</janux-island>');
      morphInto(host, '<h2>v2</h2><janux-island data-jx="w#1">s2</janux-island>');
      morphInto(host, '<janux-island data-jx="w#1">s3</janux-island><p>v3</p>');
      log.push(`same=${host.querySelector('janux-island') === islandHost} content=${islandHost!.textContent}`);
    },
    expected: ['same=true content=LIVE'],
  },
];
