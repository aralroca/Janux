import { createJanuxServer } from '@janux/server';
import { jsx } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * `GET /page.md` — the same page a human reads, as text an agent can read.
 *
 * The projection is a pragmatic HTML→Markdown pass, so what has to hold is not
 * fidelity but *determinism and preservation*: the same page projects the same
 * bytes every time, no markup survives, and nothing the page said is silently
 * merged into something else — two table cells that arrive as one word are a
 * fact the agent will get wrong.
 */

type Server = ReturnType<typeof createJanuxServer>;

const h = (tag: string, children: unknown, extra: Record<string, unknown> = {}) => jsx(tag, { children, ...extra });

const routes = {
  '/': () => h('main', [h('h1', 'Home'), h('p', 'Welcome')]),
  '/levels': () => h('main', [h('h1', 'One'), h('h2', 'Two'), h('h3', 'Three')]),
  '/untitled': () => h('main', h('p', 'No heading of its own')),
  '/subtitled': () => h('main', [h('h2', 'Section'), h('p', 'Body')]),
  '/list': () => h('main', h('ul', [h('li', 'first'), h('li', 'second')])),
  '/ordered': () => h('main', h('ol', [h('li', 'a'), h('li', 'b')])),
  '/nested': () => h('main', h('ul', h('li', ['outer', h('ul', h('li', 'inner'))]))),
  '/link': () => h('main', h('p', ['See ', jsx('a', { href: '/docs', children: 'the docs' }), ' now'])),
  '/linked-list': () => h('main', h('ul', h('li', jsx('a', { href: '/a', children: 'A' })))),
  '/external': () => h('main', h('p', jsx('a', { href: 'https://x.test/a?b=1&c=2', children: 'ext' }))),
  '/entities': () => h('main', h('p', 'a & b <c> "q" \'s\'')),
  '/break': () => h('main', h('p', ['one', jsx('br', {}), 'two'])),
  '/spaces': () => h('main', h('p', '   lots    of     space   ')),
  '/inline': () => h('main', h('h1', ['A ', h('em', 'b'), ' c'])),
  '/decorated': () => h('main', h('h1', 'Decorated', { class: 'big', id: 'top' })),
  '/paragraphs': () => h('main', [h('p', 'one'), h('p', 'two'), h('p', 'three')]),
  '/hollow': () => h('main', [h('div', ''), h('div', ''), h('p', 'x')]),
  '/section': () => h('main', h('section', [h('h2', 'S'), h('p', 'p')])),
  '/landmarks': () => h('main', [h('header', h('h1', 'H')), h('footer', 'F')]),
  '/table': () => h('main', h('table', h('tr', [h('td', 'left'), h('td', 'right')]))),
  '/script': () => h('main', [h('h1', 'Scripted'), jsx('script', { children: 'alert("<h1>not a heading</h1>")' })]),
  '/style': () => h('main', [jsx('style', { children: 'h1{color:red}' }), h('h1', 'Styled')]),
  '/vector': () => h('main', [jsx('svg', { children: jsx('path', { d: 'M0' }) }), h('p', 'after')]),
  '/hollow-page': () => h('main', ''),
  '/text': () => h('main', 'bare text'),
  '/broken': () => {
    throw new Error('page blew up');
  },
};

let cached: Server | undefined;

const docs = (): Server => (cached ??= createJanuxServer({ title: 'Docs Site', routes }));

const markdown = async (path: string, server: Server = docs()): Promise<string> =>
  (await server.fetch(new Request(`http://docs.test${path}`))).text();

const answer = async (path: string): Promise<{ status: number; type: string | null; text: string }> => {
  const res = await docs().fetch(new Request(`http://docs.test${path}`));

  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
};

export const MD_PROJECTION_CASES: ScenarioCase[] = [
  // ── the .md surface ─────────────────────────────────────────────────────────
  {
    id: 'agent2-md-a-page-is-served-as-markdown-under-the-md-suffix',
    src: 'janux',
    run: async (log) => {
      const { status, type } = await answer('/levels.md');

      log.push(`${status} ${type}`);
    },
    expected: ['200 text/markdown; charset=utf-8'],
  },
  {
    id: 'agent2-md-the-home-page-projects-under-a-bare-md',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/.md'))),
    expected: ['"# Home\\n\\nWelcome"'],
  },
  {
    id: 'agent2-md-a-page-that-does-not-exist-has-no-projection',
    src: 'janux',
    run: async (log) => {
      const { status } = await answer('/nowhere.md');

      log.push(String(status));
    },
    expected: ['404'],
  },
  {
    id: 'agent2-md-the-suffix-is-matched-case-sensitively',
    src: 'janux',
    run: async (log) => {
      const { status } = await answer('/levels.MD');

      log.push(String(status));
    },
    expected: ['404'],
  },
  {
    id: 'agent2-md-a-page-that-fails-to-render-has-no-projection-either',
    src: 'janux',
    run: async (log) => {
      const { status } = await answer('/broken.md');

      log.push(String(status));
    },
    expected: ['404'],
  },
  {
    id: 'agent2-md-the-same-page-projects-the-same-bytes-twice',
    src: 'janux',
    run: async (log) => {
      const [first, second] = await Promise.all([markdown('/levels.md'), markdown('/levels.md')]);

      log.push(`stable=${first === second}`);
    },
    expected: ['stable=true'],
  },
  {
    id: 'agent2-md-the-projection-carries-none-of-the-document-shell',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/levels.md');

      log.push(`doctype=${text.includes('<!doctype')} script=${text.includes('<script')}`);
    },
    expected: ['doctype=false script=false'],
  },
  {
    id: 'agent2-md-no-markup-survives-the-projection',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/section.md');

      log.push(`tags=${/<[a-z/][^>]*>/i.test(text)}`);
    },
    expected: ['tags=false'],
  },
  {
    id: 'agent2-md-the-page-itself-still-answers-html-at-the-unsuffixed-path',
    src: 'janux',
    run: async (log) => {
      const res = await docs().fetch(new Request('http://docs.test/levels'));

      log.push(`${res.status} ${res.headers.get('content-type')}`);
    },
    expected: ['200 text/html; charset=utf-8'],
  },

  // ── the title ───────────────────────────────────────────────────────────────
  {
    id: 'agent2-md-a-page-with-its-own-h1-is-not-titled-twice',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/levels.md'))),
    expected: ['"# One\\n\\n## Two\\n\\n### Three"'],
  },
  {
    id: 'agent2-md-a-page-without-a-heading-is-titled-by-the-app',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/untitled.md'))),
    expected: ['"# Docs Site\\n\\nNo heading of its own"'],
  },
  {
    id: 'agent2-md-a-page-that-starts-at-h2-still-gets-a-title',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/subtitled.md'))),
    expected: ['"# Docs Site\\n\\n## Section\\n\\nBody"'],
  },
  {
    id: 'agent2-md-a-page-with-nothing-in-it-projects-its-title-alone',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/hollow-page.md'))),
    expected: ['"# Docs Site\\n\\n"'],
  },
  {
    id: 'agent2-md-an-untitled-app-projects-the-body-alone',
    src: 'janux',
    run: async (log) => {
      const anonymous = createJanuxServer({ routes: { '/': () => h('main', h('p', 'body only')) } });

      log.push(JSON.stringify(await markdown('/.md', anonymous)));
    },
    expected: ['"body only"'],
  },

  // ── structure ───────────────────────────────────────────────────────────────
  {
    id: 'agent2-md-headings-keep-their-level',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/levels.md');

      log.push(text.split('\n').filter(Boolean).join(' | '));
    },
    expected: ['# One | ## Two | ### Three'],
  },
  {
    id: 'agent2-md-heading-attributes-are-dropped-and-the-text-kept',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/decorated.md'))),
    expected: ['"# Decorated"'],
  },
  {
    id: 'agent2-md-inline-emphasis-inside-a-heading-is-flattened-to-its-text',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/inline.md'))),
    expected: ['"# A b c"'],
  },
  {
    id: 'agent2-md-list-items-become-dashes',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/list.md'))),
    expected: ['"# Docs Site\\n\\n- first\\n- second"'],
  },
  {
    id: 'agent2-md-an-ordered-list-projects-as-items-too',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/ordered.md'))),
    expected: ['"# Docs Site\\n\\n- a\\n- b"'],
  },
  {
    id: 'agent2-md-a-nested-list-keeps-the-text-of-both-levels',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/nested.md');

      log.push(`outer=${text.includes('outer')} inner=${text.includes('inner')}`);
    },
    expected: ['outer=true inner=true'],
  },
  {
    id: 'agent2-md-paragraphs-are-separated-by-a-blank-line',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/paragraphs.md'))),
    expected: ['"# Docs Site\\n\\none\\n\\ntwo\\n\\nthree"'],
  },
  {
    id: 'agent2-md-two-table-cells-never-arrive-as-one-word',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/table.md');

      log.push(`glued=${text.includes('leftright')} both=${text.includes('left') && text.includes('right')}`);
    },
    expected: ['glued=false both=true'],
  },
  {
    id: 'agent2-md-a-line-break-becomes-a-newline',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/break.md'))),
    expected: ['"# Docs Site\\n\\none\\ntwo"'],
  },
  {
    id: 'agent2-md-runs-of-empty-blocks-collapse-instead-of-piling-up',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/hollow.md'))),
    expected: ['"# Docs Site\\n\\nx"'],
  },
  {
    id: 'agent2-md-never-leaves-more-than-one-blank-line-in-a-row',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/hollow.md');

      log.push(`piled=${/\n{3,}/.test(text)}`);
    },
    expected: ['piled=false'],
  },
  {
    id: 'agent2-md-a-section-is-a-block-boundary',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/section.md'))),
    expected: ['"# Docs Site\\n\\n## S\\n\\np"'],
  },
  {
    id: 'agent2-md-header-and-footer-landmarks-are-block-boundaries-too',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/landmarks.md'))),
    expected: ['"# H\\n\\nF"'],
  },
  {
    id: 'agent2-md-a-body-of-plain-text-projects-as-that-text',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/text.md'))),
    expected: ['"# Docs Site\\n\\nbare text"'],
  },
  {
    id: 'agent2-md-runs-of-whitespace-collapse-to-one-space',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/spaces.md'))),
    expected: ['"# Docs Site\\n\\nlots of space"'],
  },
  {
    id: 'agent2-md-the-projection-is-trimmed-at-both-ends',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/text.md');

      log.push(`padded=${text !== text.trim()}`);
    },
    expected: ['padded=false'],
  },

  // ── links ───────────────────────────────────────────────────────────────────
  {
    id: 'agent2-md-a-link-keeps-its-text-and-its-target',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/link.md'))),
    expected: ['"# Docs Site\\n\\nSee [the docs](/docs) now"'],
  },
  {
    id: 'agent2-md-a-link-inside-a-list-item-survives-both-transforms',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/linked-list.md'))),
    expected: ['"# Docs Site\\n\\n- [A](/a)"'],
  },
  {
    id: 'agent2-md-a-links-query-string-is-not-mangled',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/external.md'))),
    expected: ['"# Docs Site\\n\\n[ext](https://x.test/a?b=1&c=2)"'],
  },

  // ── what must not leak, and what must round-trip ────────────────────────────
  {
    id: 'agent2-md-script-source-never-reaches-the-projection',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/script.md'))),
    expected: ['"# Scripted"'],
  },
  {
    id: 'agent2-md-markup-inside-a-script-cannot-forge-a-heading',
    src: 'janux',
    run: async (log) => {
      const text = await markdown('/script.md');

      log.push(`forged=${text.includes('not a heading')}`);
    },
    expected: ['forged=false'],
  },
  {
    id: 'agent2-md-stylesheet-rules-never-reach-the-projection',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/style.md'))),
    expected: ['"# Styled"'],
  },
  {
    id: 'agent2-md-inline-svg-is-dropped-without-taking-the-text-after-it',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/vector.md'))),
    expected: ['"# Docs Site\\n\\nafter"'],
  },
  {
    id: 'agent2-md-escaped-entities-come-back-as-the-characters-the-page-meant',
    src: 'janux',
    run: async (log) => void log.push(JSON.stringify(await markdown('/entities.md'))),
    expected: ['"# Docs Site\\n\\na & b <c> \\"q\\" \'s\'"'],
  },
  {
    id: 'agent2-md-the-html-the-browser-gets-escapes-what-the-markdown-decodes',
    src: 'janux',
    run: async (log) => {
      const html = await (await docs().fetch(new Request('http://docs.test/entities'))).text();

      log.push(`escaped=${html.includes('&amp; b &lt;c&gt;')}`);
    },
    expected: ['escaped=true'],
  },
];
