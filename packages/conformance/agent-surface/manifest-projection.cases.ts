import { api, createJanuxServer } from '@janux/server';
import { buildManifest, component, createInstance, intent, int, jsx, schema, str, store, type Manifest } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The manifest as the page actually serves it: `GET /_janux/manifest?path=…`.
 *
 * `buildManifest` answers from defs; the endpoint answers from a *rendered*
 * page, which is the only thing that knows which islands mounted, which stores
 * they read and which keys they carry. The rows that matter are the ones where
 * those two could disagree — a tool an island exposes but the page never
 * mounted, a store nobody reads, a route the agent may navigate to but not
 * call — plus the projection details an agent depends on to fill a call in:
 * live `options()` enums, `ready`, `server` and `prefetch`.
 */

type Server = ReturnType<typeof createJanuxServer>;

const h = (tag: string, children: unknown) => jsx(tag, { children });

const session = store({ name: 'session', state: schema({ user: str() }), intents: {} });

const cart = component({
  name: 'cart',
  description: 'Shopping cart',
  state: schema({ items: int(), coupon: str().optional() }),
  use: { session },
  emits: { paid: schema({ id: str() }), failed: schema({ why: str() }) },
  intents: {
    add: intent({ description: 'Add an item', input: schema({ sku: str() }), run: () => {} }),
    pay: intent({ description: 'Pay', guard: 'confirm', run: () => {} }),
    nuke: intent({ description: 'Never for agents', guard: 'forbidden', run: () => {} }),
  },
  view: () => h('div', 'cart'),
});

const picker = component({
  name: 'picker',
  description: 'Picker',
  state: schema({ chosen: str() }),
  intents: {
    pick: intent({
      description: 'Pick one',
      input: schema({ id: str().options(() => ['a', 'b']) }),
      run: () => {},
    }),
    sync: intent({ description: 'Runs on the server', server: true, run: () => {} }),
    warm: intent({ description: 'Warmed when visible', prefetch: 'visible', run: () => {} }),
    later: intent({ description: 'Only once chosen', ready: ({ state }) => (state as { chosen: string }).chosen !== '', run: () => {} }),
  },
  view: () => h('div', 'picker'),
});

let cached: Server | undefined;

const shop = (): Server =>
  (cached ??= createJanuxServer({
    title: 'Shop',
    routes: {
      '/': () => h('main', jsx(cart, {})),
      '/keyed': () => h('main', jsx(cart, { key: 'aside' })),
      '/plain': () => h('main', 'nothing mounted'),
      '/picker': () => h('main', jsx(picker, {})),
    },
    apis: {
      shop: {
        read: api({ description: 'Read it', input: schema({ q: str() }), run: ({ input }) => input }),
        nuke: api({ description: 'Never', guard: 'forbidden', run: () => 'boom' }),
      },
    },
    storeDefs: { session: session as never },
  }));

interface PageManifest extends Manifest {
  routes: string[];
}

const manifestAt = async (path: string, server: Server = shop()): Promise<PageManifest> => {
  const res = await server.fetch(new Request(`http://shop.test/_janux/manifest?path=${encodeURIComponent(path)}`));

  return (await res.json()) as PageManifest;
};

const uris = (manifest: PageManifest) => manifest.resources.map((resource) => resource.uri).join(',') || 'none';
const names = (manifest: PageManifest) => manifest.tools.map((tool) => tool.name).join(',') || 'none';

export const MANIFEST_PROJECTION_CASES: ScenarioCase[] = [
  // ── the page manifest is of a *rendered* page ───────────────────────────────
  {
    id: 'agent2-a-page-manifest-describes-the-islands-that-mounted',
    src: 'janux',
    run: async (log) => void log.push(uris(await manifestAt('/'))),
    expected: ['ui://cart,store://session'],
  },
  {
    id: 'agent2-a-page-with-no-islands-describes-no-resources',
    src: 'janux',
    run: async (log) => void log.push(uris(await manifestAt('/plain'))),
    expected: ['none'],
  },
  {
    id: 'agent2-a-page-with-no-islands-still-offers-the-server-tools',
    src: 'janux',
    run: async (log) => void log.push(names(await manifestAt('/plain'))),
    expected: ['api.shop.read'],
  },
  {
    id: 'agent2-a-keyed-island-carries-its-key-into-the-resource-uri',
    src: 'janux',
    run: async (log) => void log.push((await manifestAt('/keyed')).resources[0]!.uri),
    expected: ['ui://cart#aside'],
  },
  {
    id: 'agent2-a-store-lists-the-mounted-island-that-reads-it',
    src: 'janux',
    run: async (log) => {
      const store = (await manifestAt('/keyed')).resources.find((resource) => resource.uri.startsWith('store://'));

      log.push((store!.readers ?? []).join(','));
    },
    expected: ['ui://cart#aside'],
  },
  {
    id: 'agent2-a-declared-store-exists-as-soon-as-any-island-mounts',
    src: 'janux',
    run: async (log) => void log.push(uris(await manifestAt('/picker'))),
    expected: ['ui://picker,store://session'],
  },
  {
    id: 'agent2-a-store-no-mounted-island-reads-lists-no-readers',
    src: 'janux',
    run: async (log) => {
      const store = (await manifestAt('/picker')).resources.find((resource) => resource.uri.startsWith('store://'));

      log.push(`readers=${String(store!.readers)}`);
    },
    expected: ['readers=undefined'],
  },
  {
    id: 'agent2-island-tools-come-before-the-server-tools',
    src: 'janux',
    run: async (log) => void log.push(names(await manifestAt('/'))),
    expected: ['cart.add,cart.pay,api.shop.read'],
  },
  {
    id: 'agent2-a-forbidden-island-intent-never-reaches-the-page-manifest',
    src: 'janux',
    run: async (log) => void log.push(`nuke=${names(await manifestAt('/')).includes('cart.nuke')}`),
    expected: ['nuke=false'],
  },
  {
    id: 'agent2-a-forbidden-server-tool-never-reaches-the-page-manifest',
    src: 'janux',
    run: async (log) => void log.push(`nuke=${names(await manifestAt('/')).includes('api.shop.nuke')}`),
    expected: ['nuke=false'],
  },
  {
    id: 'agent2-a-page-manifest-declares-the-events-its-islands-emit',
    src: 'janux',
    run: async (log) => void log.push((await manifestAt('/')).events.join(',') || 'none'),
    expected: ['paid,failed'],
  },
  {
    id: 'agent2-a-page-with-no-islands-declares-no-events',
    src: 'janux',
    run: async (log) => void log.push((await manifestAt('/plain')).events.join(',') || 'none'),
    expected: ['none'],
  },
  {
    id: 'agent2-a-page-manifest-states-the-format-version',
    src: 'janux',
    run: async (log) => void log.push((await manifestAt('/')).janux),
    expected: ['0.1'],
  },
  {
    id: 'agent2-a-page-manifest-maps-every-route-the-agent-may-navigate-to',
    src: 'janux',
    run: async (log) => void log.push((await manifestAt('/plain')).routes.join(',')),
    expected: ['/,/keyed,/plain,/picker'],
  },
  {
    id: 'agent2-a-dynamic-route-is-mapped-as-its-pattern-not-as-an-instance',
    src: 'janux',
    run: async (log) => {
      const server = createJanuxServer({ routes: { '/blog/[slug]': () => h('main', 'post') } });

      log.push((await manifestAt('/blog/hello', server)).routes.join(','));
    },
    expected: ['/blog/[slug]'],
  },
  {
    id: 'agent2-a-manifest-request-with-no-path-answers-for-the-home-page',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request('http://shop.test/_janux/manifest'));
      const manifest = (await res.json()) as PageManifest;

      log.push(uris(manifest));
    },
    expected: ['ui://cart,store://session'],
  },
  {
    id: 'agent2-a-manifest-for-a-page-that-does-not-exist-still-answers-the-app-surface',
    src: 'janux',
    run: async (log) => {
      const manifest = await manifestAt('/nowhere');

      log.push(`${uris(manifest)} ${names(manifest)}`);
    },
    expected: ['none api.shop.read'],
  },
  {
    id: 'agent2-a-manifest-for-a-page-that-throws-does-not-take-the-request-down',
    src: 'janux',
    run: async (log) => {
      const server = createJanuxServer({
        routes: {
          '/boom': () => {
            throw new Error('page blew up');
          },
        },
        apis: { shop: { read: api({ run: () => 1 }) } },
      });
      const res = await server.fetch(new Request('http://shop.test/_janux/manifest?path=/boom'));

      log.push(`${res.status} ${names((await res.json()) as PageManifest)}`);
    },
    expected: ['200 api.shop.read'],
  },
  {
    id: 'agent2-the-same-page-projects-the-same-manifest-twice',
    src: 'janux',
    run: async (log) => {
      const [first, second] = await Promise.all([manifestAt('/'), manifestAt('/')]);

      log.push(`stable=${JSON.stringify(first) === JSON.stringify(second)}`);
    },
    expected: ['stable=true'],
  },
  {
    id: 'agent2-a-manifest-is-served-as-json',
    src: 'janux',
    run: async (log) => {
      const res = await shop().fetch(new Request('http://shop.test/_janux/manifest?path=/'));

      log.push(res.headers.get('content-type')!);
    },
    expected: ['application/json'],
  },

  // ── how an intent projects into a tool ──────────────────────────────────────
  {
    id: 'agent2-a-mounted-intent-input-carries-the-live-option-values',
    src: 'janux',
    run: async (log) => {
      const pick = (await manifestAt('/picker')).tools.find((tool) => tool.name === 'picker.pick');

      log.push(JSON.stringify((pick!.input as { properties: unknown }).properties));
    },
    expected: ['{"id":{"type":"string","enum":["a","b"]}}'],
  },
  {
    id: 'agent2-an-unmounted-intent-input-carries-the-declaration-alone',
    src: 'janux',
    run: (log) => {
      const [pick] = buildManifest([{ def: picker as never }]).tools;

      log.push(JSON.stringify((pick!.input as { properties: unknown }).properties));
    },
    expected: ['{"id":{"type":"string"}}'],
  },
  {
    id: 'agent2-an-options-resolver-that-throws-advertises-no-enum',
    src: 'janux',
    run: (log) => {
      const broken = component({
        name: 'broken',
        state: schema({ x: str() }),
        intents: {
          pick: intent({
            description: 'x',
            input: schema({
              id: str().options(() => {
                throw new Error('resolver blew up');
              }),
            }),
            run: () => {},
          }),
        },
        view: () => h('div', 'x'),
      });
      const instance = createInstance(broken, {} as never);
      const [tool] = buildManifest([{ def: broken as never, instance }]).tools;

      log.push(JSON.stringify((tool!.input as { properties: unknown }).properties));
    },
    expected: ['{"id":{"type":"string"}}'],
  },
  {
    id: 'agent2-an-empty-options-list-advertises-no-enum',
    src: 'janux',
    run: (log) => {
      const empty = component({
        name: 'empty',
        state: schema({ x: str() }),
        intents: { pick: intent({ description: 'x', input: schema({ id: str().options(() => []) }), run: () => {} }) },
        view: () => h('div', 'x'),
      });
      const instance = createInstance(empty, {} as never);
      const [tool] = buildManifest([{ def: empty as never, instance }]).tools;

      log.push(JSON.stringify((tool!.input as { properties: unknown }).properties));
    },
    expected: ['{"id":{"type":"string"}}'],
  },
  {
    id: 'agent2-a-server-backed-intent-says-so',
    src: 'janux',
    run: async (log) => {
      const sync = (await manifestAt('/picker')).tools.find((tool) => tool.name === 'picker.sync');

      log.push(`server=${sync!.server}`);
    },
    expected: ['server=true'],
  },
  {
    id: 'agent2-a-client-intent-carries-no-server-flag-at-all',
    src: 'janux',
    run: async (log) => {
      const pick = (await manifestAt('/picker')).tools.find((tool) => tool.name === 'picker.pick');

      log.push(`server=${String(pick!.server)}`);
    },
    expected: ['server=undefined'],
  },
  {
    id: 'agent2-a-prefetching-intent-advertises-its-trigger',
    src: 'janux',
    run: async (log) => {
      const warm = (await manifestAt('/picker')).tools.find((tool) => tool.name === 'picker.warm');

      log.push(String(warm!.prefetch));
    },
    expected: ['visible'],
  },
  {
    id: 'agent2-a-mounted-intent-reports-whether-it-is-ready-right-now',
    src: 'janux',
    run: async (log) => {
      const tools = (await manifestAt('/picker')).tools.filter((tool) => tool.name.startsWith('picker.'));

      log.push(tools.map((tool) => `${tool.name}:${tool.ready}`).join(','));
    },
    expected: ['picker.pick:true,picker.sync:true,picker.warm:true,picker.later:false'],
  },
  {
    id: 'agent2-a-server-tool-is-advertised-without-a-readiness-claim',
    src: 'janux',
    run: async (log) => {
      const read = (await manifestAt('/picker')).tools.find((tool) => tool.name === 'api.shop.read');

      log.push(`ready=${String(read!.ready)}`);
    },
    expected: ['ready=undefined'],
  },
  {
    id: 'agent2-a-ready-check-flips-once-the-state-it-reads-changes',
    src: 'janux',
    run: async (log) => {
      const gated = component({
        name: 'gated',
        state: schema({ chosen: str() }),
        intents: {
          choose: intent({ description: 'Choose', run: ({ state }) => (state.chosen = 'a') }),
          later: intent({ description: 'Later', ready: ({ state }) => (state as { chosen: string }).chosen !== '', run: () => {} }),
        },
        view: () => h('div', 'x'),
      });
      const instance = createInstance(gated, {} as never);
      const readiness = () => buildManifest([{ def: gated as never, instance }]).tools.find((tool) => tool.name === 'gated.later')!.ready;
      const before = readiness();

      await instance.intents.choose!(undefined, { origin: 'human' });
      log.push(`before=${before} after=${readiness()}`);
    },
    expected: ['before=false after=true'],
  },
  {
    id: 'agent2-a-tool-name-is-the-component-and-the-intent',
    src: 'janux',
    run: (log) => log.push(buildManifest([{ def: cart as never }]).tools.map((tool) => tool.name).join(',')),
    expected: ['cart.add,cart.pay'],
  },
  {
    id: 'agent2-a-keyed-island-does-not-key-its-tool-names',
    src: 'janux',
    run: async (log) => void log.push(names(await manifestAt('/keyed'))),
    expected: ['cart.add,cart.pay,api.shop.read'],
  },

  // ── resources ───────────────────────────────────────────────────────────────
  {
    id: 'agent2-a-resource-describes-the-component-it-projects',
    src: 'janux',
    run: async (log) => {
      const [resource] = (await manifestAt('/')).resources;

      log.push(`${resource!.uri} ${resource!.description}`);
    },
    expected: ['ui://cart Shopping cart'],
  },
  {
    id: 'agent2-a-component-without-a-description-still-gets-a-resource',
    src: 'janux',
    run: (log) => {
      const anonymous = component({ name: 'anon', state: schema({ x: int() }), intents: {}, view: () => h('div', 'x') });
      const [resource] = buildManifest([{ def: anonymous as never }]).resources;

      log.push(`${resource!.uri} description=${String(resource!.description)}`);
    },
    expected: ['ui://anon description=undefined'],
  },
  {
    id: 'agent2-an-optional-state-field-is-not-required-in-the-resource-schema',
    src: 'janux',
    run: (log) => {
      const [resource] = buildManifest([{ def: cart as never }]).resources;

      log.push(JSON.stringify((resource!.schema as { required: string[] }).required));
    },
    expected: ['["items"]'],
  },
  {
    id: 'agent2-a-store-and-a-component-of-the-same-name-live-under-different-schemes',
    src: 'janux',
    run: (log) => {
      const twin = store({ name: 'cart', state: schema({ items: int() }), intents: {} });
      const manifest = buildManifest([{ def: cart as never }, { def: twin as never }]);

      log.push(manifest.resources.map((resource) => resource.uri).join(','));
    },
    expected: ['ui://cart,store://cart'],
  },
  {
    id: 'agent2-a-store-with-intents-contributes-them-as-tools',
    src: 'janux',
    run: (log) => {
      const account = store({
        name: 'account',
        state: schema({ user: str() }),
        intents: { login: intent({ description: 'Log in', run: () => {} }) },
      });

      log.push(buildManifest([{ def: account as never }]).tools.map((tool) => tool.name).join(','));
    },
    expected: ['account.login'],
  },
  {
    id: 'agent2-two-islands-reading-one-store-are-both-listed-as-readers',
    src: 'janux',
    run: (log) => {
      const reader = (name: string) =>
        component({ name, state: schema({ x: int() }), use: { session }, intents: {}, view: () => h('div', 'x') });
      const manifest = buildManifest([
        { def: reader('left') as never },
        { def: reader('right') as never },
        { def: session as never },
      ]);
      const store = manifest.resources.find((resource) => resource.uri.startsWith('store://'));

      log.push((store!.readers ?? []).join(','));
    },
    expected: ['ui://left,ui://right'],
  },
  {
    id: 'agent2-a-store-with-no-readers-carries-no-reader-list',
    src: 'janux',
    run: (log) => {
      const [resource] = buildManifest([{ def: session as never }]).resources;

      log.push(`readers=${String(resource!.readers)}`);
    },
    expected: ['readers=undefined'],
  },
  {
    id: 'agent2-a-store-does-not-count-itself-as-a-reader-of-a-store',
    src: 'janux',
    run: (log) => {
      const derived = store({ name: 'derived', state: schema({ n: int() }), use: { session }, intents: {} });
      const manifest = buildManifest([{ def: derived as never }, { def: session as never }]);
      const target = manifest.resources.find((resource) => resource.uri === 'store://session');

      log.push(`readers=${String(target!.readers)}`);
    },
    expected: ['readers=undefined'],
  },
  {
    id: 'agent2-the-same-def-mounted-twice-projects-two-resources',
    src: 'janux',
    run: (log) => {
      const manifest = buildManifest([
        { def: cart as never, key: 'one' },
        { def: cart as never, key: 'two' },
      ]);

      log.push(manifest.resources.map((resource) => resource.uri).join(','));
    },
    expected: ['ui://cart#one,ui://cart#two'],
  },
  {
    id: 'agent2-the-same-def-mounted-twice-repeats-its-tools',
    src: 'janux',
    run: (log) => {
      const manifest = buildManifest([
        { def: cart as never, key: 'one' },
        { def: cart as never, key: 'two' },
      ]);

      log.push(`tools=${manifest.tools.length}`);
    },
    expected: ['tools=4'],
  },
  {
    id: 'agent2-events-are-declared-once-however-many-islands-emit-them',
    src: 'janux',
    run: (log) => {
      const manifest = buildManifest([
        { def: cart as never, key: 'one' },
        { def: cart as never, key: 'two' },
      ]);

      log.push(manifest.events.join(','));
    },
    expected: ['paid,failed'],
  },
  {
    id: 'agent2-a-component-with-no-state-projects-no-resource-but-keeps-its-tools',
    src: 'janux',
    run: (log) => {
      const stateless = component({
        name: 'ticker',
        intents: { tick: intent({ description: 'Tick', run: () => {} }) },
        view: () => h('div', 'x'),
      });
      const manifest = buildManifest([{ def: stateless as never }]);

      log.push(`resources=${manifest.resources.length} tools=${manifest.tools.map((tool) => tool.name).join(',')}`);
    },
    expected: ['resources=0 tools=ticker.tick'],
  },

  // ── the shape holds even when there is nothing to say ──────────────────────
  {
    id: 'agent2-an-app-with-no-routes-still-answers-a-well-formed-manifest',
    src: 'janux',
    run: async (log) => {
      const empty = createJanuxServer({});
      const manifest = await manifestAt('/', empty);

      log.push(`${manifest.janux} ${manifest.resources.length} ${manifest.tools.length} ${manifest.events.length} ${manifest.routes.length}`);
    },
    expected: ['0.1 0 0 0 0'],
  },
  {
    id: 'agent2-a-component-with-no-intents-contributes-no-tools',
    src: 'janux',
    run: (log) => {
      const quiet = component({ name: 'quiet', state: schema({ x: int() }), intents: {}, view: () => h('div', 'x') });

      log.push(`tools=${buildManifest([{ def: quiet as never }]).tools.length}`);
    },
    expected: ['tools=0'],
  },
  {
    id: 'agent2-the-default-key-is-left-out-of-the-tool-and-resource-names',
    src: 'janux',
    run: (log) => {
      const manifest = buildManifest([{ def: cart as never, key: 'default' }]);

      log.push(`${manifest.resources[0]!.uri} ${manifest.tools[0]!.name}`);
    },
    expected: ['ui://cart cart.add'],
  },
  {
    id: 'agent2-an-empty-key-is-treated-as-no-key',
    src: 'janux',
    run: (log) => log.push(buildManifest([{ def: cart as never, key: '' }]).resources[0]!.uri),
    expected: ['ui://cart'],
  },
];
