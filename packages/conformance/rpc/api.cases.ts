import { api, apiManifestTools, collectApis, invokeApi, isApi, type ApiTool } from '@janux/server';
import { int, schema, str, type AuditEntry } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `api()` — one definition that is an HTTP endpoint, a client stub and an agent
 * tool at once. The rows here are about the seam all three share: guard, input
 * validation, output validation and the audit entry.
 */

const search = api({
  description: 'Search orders',
  input: schema({ q: str().min(1) }),
  output: schema({ count: int() }),
  run: ({ input }) => ({ count: (input as { q: string }).q.length }),
});

function collect(mod: Record<string, unknown>, namespace = 'shop'): ApiTool[] {
  return collectApis({ [namespace]: mod });
}

const first = (mod: Record<string, unknown>): ApiTool => collect(mod)[0]!;

/** `name guard origin ok` from an audit entry. */
const line = (entry: AuditEntry) => `${entry.tool} ${entry.guard} ${entry.origin} ok=${entry.ok}`;

export const API_CASES: ScenarioCase[] = [
  // ── definition and collection ───────────────────────────────────────────────
  {
    id: 'api-requires-a-run-function',
    src: 'janux',
    run: (log) => attempt(log, 'define', () => api({ description: 'x' } as never)),
    expected: ['define:threw:Janux: api() requires run()'],
  },
  {
    id: 'api-is-recognisable-after-definition',
    src: 'janux',
    run: (log) => {
      log.push(`${isApi(search)}:${isApi({ run: () => {} })}`);
    },
    expected: ['true:false'],
  },
  {
    id: 'api-is-not-confused-by-null-or-undefined',
    src: 'janux',
    run: (log) => {
      log.push(`${isApi(null)}:${isApi(undefined)}`);
    },
    expected: ['false:false'],
  },
  {
    id: 'api-collection-namespaces-the-tool-name',
    src: 'janux',
    run: (log) => {
      log.push(first({ searchOrders: search }).name);
    },
    expected: ['shop.searchOrders'],
  },
  {
    id: 'api-collection-ignores-non-api-exports',
    src: 'janux',
    run: (log) => {
      log.push(String(collect({ searchOrders: search, helper: () => {}, VERSION: '1' }).length));
    },
    expected: ['1'],
  },
  {
    id: 'api-collection-refuses-a-double-underscore-in-the-name',
    src: 'janux',
    run: (log) => attempt(log, 'collect', () => collect({ bad__name: search })),
    expected: [
      'collect:threw:Janux: api name "shop.bad__name" may not contain "__" (reserved for tool wire names)',
    ],
  },
  {
    id: 'api-collection-refuses-a-double-underscore-in-the-namespace',
    src: 'janux',
    run: (log) => attempt(log, 'collect', () => collect({ ok: search }, 'we__ird')),
    expected: [
      'collect:threw:Janux: api name "we__ird.ok" may not contain "__" (reserved for tool wire names)',
    ],
  },
  {
    id: 'api-a-single-underscore-is-allowed',
    src: 'janux',
    run: (log) => {
      log.push(first({ search_orders: search }).name);
    },
    expected: ['shop.search_orders'],
  },

  // ── the invocation pipeline ─────────────────────────────────────────────────
  {
    id: 'api-runs-and-returns-the-validated-output',
    src: 'janux',
    run: async (log) => {
      log.push(JSON.stringify(await invokeApi(first({ s: search }), { q: 'abc' }, {}, 'human')));
    },
    expected: ['{"count":3}'],
  },
  {
    id: 'api-strips-undeclared-input-fields',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await invokeApi(first({ s: search }), { q: 'ab', extra: 'no' }, {}, 'agent', (entry) => audits.push(entry));
      log.push(JSON.stringify(audits[0]!.input));
    },
    expected: ['{"q":"ab"}'],
  },
  {
    id: 'api-refuses-invalid-input',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => invokeApi(first({ s: search }), { q: '' }, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — q: below min 1'],
  },
  {
    id: 'api-refuses-a-missing-required-field',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => invokeApi(first({ s: search }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — q: required'],
  },
  {
    id: 'api-treats-a-missing-body-as-an-empty-object',
    src: 'janux',
    run: async (log) => {
      await attempt(log, 'call', () => invokeApi(first({ s: search }), undefined, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.s" — q: required'],
  },
  {
    id: 'api-an-undeclared-input-schema-passes-nothing-through',
    src: 'janux',
    run: async (log) => {
      const bare = api({ description: 'x', run: ({ input }) => `input=${String(input)}` });

      log.push(String(await invokeApi(first({ s: bare }), { smuggled: true }, {}, 'agent')));
    },
    expected: ['input=undefined'],
  },
  {
    id: 'api-refuses-to-return-an-output-that-breaks-its-schema',
    src: 'janux',
    run: async (log) => {
      const wrong = api({ description: 'x', output: schema({ count: int() }), run: () => ({ count: 'lots' }) });

      await attempt(log, 'call', () => invokeApi(first({ s: wrong }), {}, {}, 'human'));
    },
    expected: ['call:threw:Janux: api "shop.s" returned an invalid output'],
  },
  {
    id: 'api-output-validation-strips-undeclared-fields',
    src: 'janux',
    run: async (log) => {
      const extra = api({ description: 'x', output: schema({ count: int() }), run: () => ({ count: 1, secret: 'leak' }) });

      log.push(JSON.stringify(await invokeApi(first({ s: extra }), {}, {}, 'agent')));
    },
    expected: ['{"count":1}'],
  },
  {
    id: 'api-without-an-output-schema-returns-whatever-run-produced',
    src: 'janux',
    run: async (log) => {
      const loose = api({ description: 'x', run: () => ({ anything: true }) });

      log.push(JSON.stringify(await invokeApi(first({ s: loose }), {}, {}, 'agent')));
    },
    expected: ['{"anything":true}'],
  },
  {
    id: 'api-run-receives-the-context',
    src: 'janux',
    run: async (log) => {
      const contextual = api({ description: 'x', run: ({ ctx }) => `role=${(ctx as { role?: string }).role}` });

      log.push(String(await invokeApi(first({ s: contextual }), {}, { role: 'admin' } as never, 'human')));
    },
    expected: ['role=admin'],
  },

  // ── guards ──────────────────────────────────────────────────────────────────
  {
    id: 'api-forbidden-refuses-an-agent',
    src: 'janux',
    run: async (log) => {
      const closed = api({ description: 'x', guard: 'forbidden', run: () => 1 });

      await attempt(log, 'call', () => invokeApi(first({ s: closed }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Tool "shop.s" is not available'],
  },
  {
    id: 'api-forbidden-still-runs-server-side',
    src: 'janux',
    run: async (log) => {
      const closed = api({ description: 'x', guard: 'forbidden', run: () => 'ran' });

      log.push(String(await invokeApi(first({ s: closed }), {}, {}, 'human')));
    },
    expected: ['ran'],
  },
  {
    id: 'api-a-guard-function-sees-the-context',
    src: 'janux',
    run: async (log) => {
      const scoped = api({
        description: 'x',
        guard: ({ ctx }) => ((ctx as { role?: string }).role === 'admin' ? 'auto' : 'forbidden'),
        run: () => 'ran',
      });

      log.push(String(await invokeApi(first({ s: scoped }), {}, { role: 'admin' } as never, 'agent')));
      await attempt(log, 'guest', () => invokeApi(first({ s: scoped }), {}, { role: 'guest' } as never, 'agent'));
    },
    expected: ['ran', 'guest:threw:Tool "shop.s" is not available'],
  },
  {
    id: 'api-a-throwing-guard-denies-instead-of-propagating',
    src: 'janux',
    run: async (log) => {
      const risky = api({
        description: 'x',
        guard: () => {
          throw new Error('guard blew up');
        },
        run: () => 'ran',
      });

      await attempt(log, 'call', () => invokeApi(first({ s: risky }), {}, {}, 'agent'));
    },
    expected: ['call:threw:Tool "shop.s" is not available'],
  },

  // ── the audit trail ─────────────────────────────────────────────────────────
  {
    id: 'api-a-success-is-audited-with-the-parsed-input',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await invokeApi(first({ s: search }), { q: 'ab' }, {}, 'agent', (entry) => audits.push(entry));
      log.push(...audits.map(line));
    },
    expected: ['api.shop.s auto agent ok=true'],
  },
  {
    id: 'api-a-failure-is-audited-with-the-raw-input',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await attempt(log, 'call', () => invokeApi(first({ s: search }), { q: '' }, {}, 'agent', (entry) => audits.push(entry)));
      log.push(...audits.map(line), JSON.stringify(audits[0]!.input));
    },
    expected: [
      'call:threw:Invalid input for "shop.s" — q: below min 1',
      'api.shop.s auto agent ok=false',
      '{"q":""}',
    ],
  },
  {
    id: 'api-the-audit-tool-name-is-prefixed-for-the-agent-namespace',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await invokeApi(first({ s: search }), { q: 'x' }, {}, 'human', (entry) => audits.push(entry));
      log.push(audits[0]!.tool);
    },
    expected: ['api.shop.s'],
  },
  {
    id: 'api-a-verified-agent-key-reaches-the-audit-entry',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const ctx = { agent: { verified: true, keyId: 'key-1' } } as never;

      await invokeApi(first({ s: search }), { q: 'x' }, ctx, 'agent', (entry) => audits.push(entry));
      log.push(String(audits[0]!.agent));
    },
    expected: ['key-1'],
  },
  {
    id: 'api-an-unverified-agent-key-is-not-recorded',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const ctx = { agent: { verified: false, keyId: 'key-1' } } as never;

      await invokeApi(first({ s: search }), { q: 'x' }, ctx, 'agent', (entry) => audits.push(entry));
      log.push(String(audits[0]!.agent));
    },
    expected: ['undefined'],
  },

  // ── the api manifest ────────────────────────────────────────────────────────
  {
    id: 'api-manifest-prefixes-every-tool-with-api',
    src: 'janux',
    run: (log) => {
      log.push(apiManifestTools(collect({ searchOrders: search }), {})[0]!.name);
    },
    expected: ['api.shop.searchOrders'],
  },
  {
    id: 'api-manifest-omits-a-forbidden-tool',
    src: 'janux',
    run: (log) => {
      const closed = api({ description: 'x', guard: 'forbidden', run: () => 1 });

      log.push(String(apiManifestTools(collect({ open: search, closed }), {}).length));
    },
    expected: ['1'],
  },
  {
    id: 'api-manifest-projects-the-input-schema',
    src: 'janux',
    run: (log) => {
      log.push(JSON.stringify(apiManifestTools(collect({ s: search }), {})[0]!.input));
    },
    expected: ['{"type":"object","properties":{"q":{"type":"string","minLength":1}},"required":["q"],"additionalProperties":false}'],
  },
  {
    id: 'api-manifest-survives-a-throwing-guard-and-omits-that-tool',
    src: 'janux',
    run: (log) => {
      const risky = api({
        description: 'x',
        guard: () => {
          throw new Error('guard blew up');
        },
        run: () => 1,
      });

      attempt(log, 'build', () =>
        log.push(apiManifestTools(collect({ open: search, risky }), {}).map((tool) => tool.name).join(',')),
      );
    },
    expected: ['api.shop.open', 'build:ok'],
  },
  {
    id: 'api-manifest-never-advertises-a-tool-as-forbidden',
    src: 'janux',
    run: (log) => {
      let calls = 0;
      const flaky = api({ description: 'x', guard: () => (calls++ % 2 ? 'forbidden' : 'auto'), run: () => 1 });
      const advertised = apiManifestTools(collect({ flaky }), {});

      log.push(advertised.filter((tool) => tool.guard === 'forbidden').map((tool) => tool.name).join(',') || 'none');
    },
    expected: ['none'],
  },
];
