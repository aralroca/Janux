import { api, buildLlmsTxt, createJanuxServer, type LlmsTxtTool } from '@janux/server';
import { jsx, schema, str } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * `/llms.txt` — the index an agent reads before it reads anything else.
 *
 * It is the only agent surface a crawler finds without being told where to
 * look, so the rows that matter are the ones about what it *names*: every page
 * (in every locale), every tool an agent may call — and never a tool the app
 * closed to agents, which would advertise a capability by another route than
 * the manifest and the MCP endpoint.
 */

type Server = ReturnType<typeof createJanuxServer>;

const h = (tag: string, children: unknown) => jsx(tag, { children });

const tool = (name: string, guard: string, description?: string): LlmsTxtTool => ({ name, guard, description });

const shop = (extra: Record<string, unknown>): Server =>
  createJanuxServer({
    title: 'Shop',
    routes: { '/': () => h('main', 'home'), '/about': () => h('main', 'about') },
    apis: {
      shop: {
        read: api({ description: 'Read', input: schema({ q: str() }), run: () => 1 }),
        pay: api({ description: 'Pay', guard: 'confirm', run: () => 1 }),
        nuke: api({ description: 'Never for agents', guard: 'forbidden', run: () => 1 }),
      },
    },
    ...extra,
  });

const fetched = async (server: Server): Promise<{ status: number; type: string | null; body: string }> => {
  const res = await server.fetch(new Request('http://shop.test/llms.txt'));

  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
};

/** The lines under `## <section>`, up to the next section. */
function section(text: string, heading: string): string[] {
  const blocks = text.split(/^## /m).find((block) => block.startsWith(heading));

  return (blocks ?? '')
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

export const LLMS_TXT_CASES: ScenarioCase[] = [
  // ── the document ────────────────────────────────────────────────────────────
  {
    id: 'agent2-llms-an-app-with-nothing-in-it-still-produces-a-titled-document',
    src: 'janux',
    run: (log) => log.push(JSON.stringify(buildLlmsTxt({}, [], []))),
    expected: ['"# Janux app\\n"'],
  },
  {
    id: 'agent2-llms-the-app-title-is-the-heading',
    src: 'janux',
    run: (log) => log.push(JSON.stringify(buildLlmsTxt({ title: 'Shop' }, [], []))),
    expected: ['"# Shop\\n"'],
  },
  {
    id: 'agent2-llms-a-description-is-quoted-under-the-title',
    src: 'janux',
    run: (log) => log.push(JSON.stringify(buildLlmsTxt({ title: 'Shop', description: 'A shop' }, [], []))),
    expected: ['"# Shop\\n\\n> A shop\\n"'],
  },
  {
    id: 'agent2-llms-the-document-always-ends-with-a-newline',
    src: 'janux',
    run: (log) => {
      const shapes = [buildLlmsTxt({}, [], []), buildLlmsTxt({}, ['/'], []), buildLlmsTxt({}, [], [tool('api.a', 'auto')])];

      log.push(`${shapes.every((text) => text.endsWith('\n'))}`);
    },
    expected: ['true'],
  },
  {
    id: 'agent2-llms-an-empty-page-list-writes-no-pages-section',
    src: 'janux',
    run: (log) => log.push(`pages=${buildLlmsTxt({}, [], [tool('api.a', 'auto')]).includes('## Pages')}`),
    expected: ['pages=false'],
  },
  {
    id: 'agent2-llms-an-empty-tool-list-writes-no-tools-section',
    src: 'janux',
    run: (log) => log.push(`tools=${buildLlmsTxt({}, ['/'], []).includes('## Agent tools')}`),
    expected: ['tools=false'],
  },
  {
    id: 'agent2-llms-pages-come-before-tools',
    src: 'janux',
    run: (log) => {
      const text = buildLlmsTxt({}, ['/'], [tool('api.a', 'auto')]);

      log.push(`ordered=${text.indexOf('## Pages') < text.indexOf('## Agent tools')}`);
    },
    expected: ['ordered=true'],
  },

  // ── pages ───────────────────────────────────────────────────────────────────
  {
    id: 'agent2-llms-every-page-is-linked-by-its-own-path',
    src: 'janux',
    run: (log) => log.push(section(buildLlmsTxt({}, ['/', '/about'], []), 'Pages').join(' ')),
    expected: ['[/](/) [/about](/about)'],
  },
  {
    id: 'agent2-llms-page-order-is-the-order-it-was-given',
    src: 'janux',
    run: (log) => log.push(section(buildLlmsTxt({}, ['/z', '/a', '/m'], []), 'Pages').join(',')),
    expected: ['[/z](/z),[/a](/a),[/m](/m)'],
  },
  {
    id: 'agent2-llms-a-dynamic-pattern-is-listed-verbatim-when-nothing-expanded-it',
    src: 'janux',
    run: (log) => log.push(section(buildLlmsTxt({}, ['/blog/[slug]'], []), 'Pages').join(',')),
    expected: ['[/blog/[slug]](/blog/[slug])'],
  },

  // ── tools ───────────────────────────────────────────────────────────────────
  {
    id: 'agent2-llms-a-tool-links-to-the-endpoint-that-invokes-it',
    src: 'janux',
    run: (log) => log.push(section(buildLlmsTxt({}, [], [tool('api.shop.read', 'auto', 'Read')]), 'Agent tools').join(',')),
    expected: ['[api.shop.read](/_janux/api/shop.read): Read'],
  },
  {
    id: 'agent2-llms-the-endpoint-path-drops-the-api-namespace-the-name-carries',
    src: 'janux',
    run: (log) => {
      const line = section(buildLlmsTxt({}, [], [tool('api.shop.read', 'auto')]), 'Agent tools')[0]!;

      log.push(line.slice(line.indexOf('(') + 1, line.indexOf(')')));
    },
    expected: ['/_janux/api/shop.read'],
  },
  {
    id: 'agent2-llms-a-confirm-tool-says-a-human-has-to-approve-it',
    src: 'janux',
    run: (log) => log.push(section(buildLlmsTxt({}, [], [tool('api.shop.pay', 'confirm', 'Pay')]), 'Agent tools').join(',')),
    expected: ['[api.shop.pay](/_janux/api/shop.pay): Pay (requires human approval)'],
  },
  {
    id: 'agent2-llms-an-auto-tool-makes-no-claim-about-approval',
    src: 'janux',
    run: (log) => log.push(`approval=${buildLlmsTxt({}, [], [tool('api.a', 'auto', 'A')]).includes('approval')}`),
    expected: ['approval=false'],
  },
  {
    id: 'agent2-llms-a-tool-without-a-description-still-gets-a-line',
    src: 'janux',
    run: (log) => log.push(section(buildLlmsTxt({}, [], [tool('api.shop.bare', 'auto')]), 'Agent tools').join(',')),
    expected: ['[api.shop.bare](/_janux/api/shop.bare):'],
  },
  {
    id: 'agent2-llms-the-tools-section-explains-how-to-call-them',
    src: 'janux',
    run: (log) => {
      const text = buildLlmsTxt({}, [], [tool('api.a', 'auto')]);

      log.push(`invoke=${text.includes('POST /_janux/api/<name>')} manifest=${text.includes('/_janux/manifest?path=<page>')}`);
    },
    expected: ['invoke=true manifest=true'],
  },
  {
    id: 'agent2-llms-tool-order-is-the-order-it-was-given',
    src: 'janux',
    run: (log) => {
      const tools = [tool('api.z', 'auto'), tool('api.a', 'auto')];

      log.push(section(buildLlmsTxt({}, [], tools), 'Agent tools').map((line) => line.split(']')[0]!.slice(1)).join(','));
    },
    expected: ['api.z,api.a'],
  },

  // ── the route that serves it ────────────────────────────────────────────────
  {
    id: 'agent2-llms-the-route-serves-plain-text',
    src: 'janux',
    run: async (log) => {
      const { status, type } = await fetched(shop({ llmsTxt: {} }));

      log.push(`${status} ${type}`);
    },
    expected: ['200 text/plain; charset=utf-8'],
  },
  {
    id: 'agent2-llms-an-app-that-declares-no-llms-txt-does-not-serve-one',
    src: 'janux',
    run: async (log) => {
      const { status } = await fetched(shop({}));

      log.push(String(status));
    },
    expected: ['404'],
  },
  {
    id: 'agent2-llms-the-served-index-names-every-route',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(shop({ llmsTxt: {} }));

      log.push(section(body, 'Pages').join(','));
    },
    expected: ['[/](/),[/about](/about)'],
  },
  {
    id: 'agent2-llms-the-served-index-names-the-callable-tools',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(shop({ llmsTxt: {} }));

      log.push(section(body, 'Agent tools').map((line) => line.split(']')[0]!.slice(1)).join(','));
    },
    expected: ['api.shop.read,api.shop.pay'],
  },
  {
    id: 'agent2-llms-the-served-index-never-names-a-forbidden-tool',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(shop({ llmsTxt: {} }));

      log.push(`name=${body.includes('shop.nuke')} description=${body.includes('Never for agents')}`);
    },
    expected: ['name=false description=false'],
  },
  {
    id: 'agent2-llms-the-app-title-carries-into-the-served-index',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(shop({ llmsTxt: {} }));

      log.push(body.split('\n')[0]!);
    },
    expected: ['# Shop'],
  },
  {
    id: 'agent2-llms-an-explicit-llms-title-wins-over-the-app-title',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(shop({ llmsTxt: { title: 'Shop for agents' } }));

      log.push(body.split('\n')[0]!);
    },
    expected: ['# Shop for agents'],
  },
  {
    id: 'agent2-llms-the-declared-description-reaches-the-served-index',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(shop({ llmsTxt: { description: 'A shop' } }));

      log.push(body.split('\n')[2]!);
    },
    expected: ['> A shop'],
  },
  {
    id: 'agent2-llms-an-i18n-app-lists-every-page-in-every-locale',
    src: 'janux',
    run: async (log) => {
      const server = shop({ llmsTxt: {}, i18n: { locales: ['en', 'es'], defaultLocale: 'en', messages: {} } });
      const { body } = await fetched(server);

      log.push(section(body, 'Pages').map((line) => line.split(']')[0]!.slice(1)).join(','));
    },
    expected: ['/en,/en/about,/es,/es/about'],
  },
  {
    id: 'agent2-llms-a-localised-home-page-is-the-locale-prefix-alone',
    src: 'janux',
    run: async (log) => {
      const server = shop({ llmsTxt: {}, i18n: { locales: ['fr'], defaultLocale: 'fr', messages: {} } });
      const { body } = await fetched(server);

      log.push(section(body, 'Pages')[0]!);
    },
    expected: ['[/fr](/fr)'],
  },
  {
    id: 'agent2-llms-the-index-is-the-same-document-on-every-request',
    src: 'janux',
    run: async (log) => {
      const server = shop({ llmsTxt: { description: 'A shop' } });
      const [first, second] = await Promise.all([fetched(server), fetched(server)]);

      log.push(`stable=${first.body === second.body}`);
    },
    expected: ['stable=true'],
  },
  {
    id: 'agent2-llms-an-app-with-no-pages-and-no-tools-still-serves-a-title',
    src: 'janux',
    run: async (log) => {
      const { body } = await fetched(createJanuxServer({ title: 'Bare', llmsTxt: {} }));

      log.push(JSON.stringify(body));
    },
    expected: ['"# Bare\\n"'],
  },
  {
    id: 'agent2-llms-the-index-names-the-same-tools-the-manifest-does',
    src: 'janux',
    run: async (log) => {
      const server = shop({ llmsTxt: {} });
      const { body } = await fetched(server);
      const manifest = (await (await server.fetch(new Request('http://shop.test/_janux/manifest?path=/'))).json()) as {
        tools: { name: string }[];
      };

      log.push(
        `${section(body, 'Agent tools').map((line) => line.split(']')[0]!.slice(1)).join(',')} | ${manifest.tools
          .map((tool) => tool.name)
          .join(',')}`,
      );
    },
    expected: ['api.shop.read,api.shop.pay | api.shop.read,api.shop.pay'],
  },
];
