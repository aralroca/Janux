import { api, apiManifestTools, collectApis, invokeApi, isApi, type ApiTool } from '@janux/server';
import {
  buildManifest,
  component,
  createInstance,
  intent,
  int,
  jsx,
  resolveGuard,
  schema,
  str,
  type AuditEntry,
} from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * What a guard is allowed to answer, and what happens when it answers something
 * else.
 *
 * A guard has exactly three answers, and the gate is the only thing standing
 * between an agent and a tool the app closed to it. So the rows that matter are
 * the ones where the guard does not answer properly: an `async` guard (which
 * the types forbid and JavaScript allows), a typo, `undefined`, an object. Each
 * of those used to be *not* `'forbidden'`, which is how a fail-closed gate
 * failed open — silently, for every agent call.
 *
 * The two faces are checked side by side on purpose: `resolveGuard` (mounted
 * intents) and `resolveApiGuard` (server `api()` tools) are the same decision
 * made twice, and a divergence between them is a hole in one of the two.
 */

const bag = (state: Record<string, unknown> = {}) => ({ state, ctx: {}, input: undefined }) as never;

/** The guard a mounted intent resolves to for an agent, whatever it answered. */
const forAgent = (guard: unknown, ctx: Record<string, unknown> = {}) =>
  resolveGuard(intent({ description: 'x', guard: guard as never, run: () => {} }), ctx as never, 'agent');

const forHuman = (guard: unknown) =>
  resolveGuard(intent({ description: 'x', guard: guard as never, run: () => {} }), {} as never, 'human');

/** The same question asked of a server `api()` tool, via the manifest it produces. */
function apiGuardFor(guard: unknown, ctx: Record<string, unknown> = {}): string {
  const tool = { name: 'shop.t', description: 'x', guard: guard as never, run: () => 'ran' } as ApiTool;
  const [advertised] = apiManifestTools([tool], ctx as never);

  return advertised ? advertised.guard : 'omitted';
}

/** A component whose single intent carries the guard under test. */
function guarded(guard: unknown) {
  return component({
    name: 'thing',
    description: 'A thing',
    state: schema({ n: int() }),
    intents: {
      act: intent({ description: 'Act', guard: guard as never, run: ({ state }) => (state.n += 1) }),
    },
    view: () => jsx('div', {}),
  });
}

function mounted(guard: unknown): { instance: ReturnType<typeof createInstance>; audits: AuditEntry[] } {
  const audits: AuditEntry[] = [];
  const instance = createInstance(guarded(guard), { onAudit: (entry: AuditEntry) => audits.push(entry) } as never);

  return { instance, audits };
}

const toolNames = (guard: unknown, ctx: Record<string, unknown> = {}) =>
  buildManifest([{ def: guarded(guard) as never }], ctx as never)
    .tools.map((tool) => tool.name)
    .join(',') || 'none';

/** One `api()` tool, invoked directly through the server pipeline. */
const tool = (def: Record<string, unknown>): ApiTool => ({ name: 'shop.t', ...def } as ApiTool);

export const GUARD_RESOLUTION_CASES: ScenarioCase[] = [
  // ── the three answers, on both faces ────────────────────────────────────────
  {
    id: 'agent2-an-intent-without-a-guard-is-auto',
    src: 'janux',
    run: (log) => log.push(resolveGuard(intent({ description: 'x', run: () => {} }), {} as never, 'agent')),
    expected: ['auto'],
  },
  {
    id: 'agent2-a-static-auto-guard-resolves-to-auto',
    src: 'janux',
    run: (log) => log.push(forAgent('auto')),
    expected: ['auto'],
  },
  {
    id: 'agent2-a-static-confirm-guard-resolves-to-confirm',
    src: 'janux',
    run: (log) => log.push(forAgent('confirm')),
    expected: ['confirm'],
  },
  {
    id: 'agent2-a-static-forbidden-guard-resolves-to-forbidden',
    src: 'janux',
    run: (log) => log.push(forAgent('forbidden')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-an-api-tool-without-a-guard-is-auto',
    src: 'janux',
    run: (log) => log.push(apiGuardFor(undefined)),
    expected: ['auto'],
  },
  {
    id: 'agent2-an-api-tool-with-a-confirm-guard-is-advertised-as-confirm',
    src: 'janux',
    run: (log) => log.push(apiGuardFor('confirm')),
    expected: ['confirm'],
  },
  {
    id: 'agent2-a-forbidden-api-tool-is-left-out-of-the-manifest-entirely',
    src: 'janux',
    run: (log) => log.push(apiGuardFor('forbidden')),
    expected: ['omitted'],
  },

  // ── a guard function decides per call ───────────────────────────────────────
  {
    id: 'agent2-a-guard-function-is-told-the-origin',
    src: 'janux',
    run: (log) => {
      const guard = ({ origin }: { origin: string }) => (origin === 'agent' ? 'confirm' : 'auto');

      log.push(`agent=${forAgent(guard)}`, `human=${forHuman(guard)}`);
    },
    expected: ['agent=confirm', 'human=auto'],
  },
  {
    id: 'agent2-a-guard-function-is-told-the-request-context',
    src: 'janux',
    run: (log) => {
      const guard = ({ ctx }: { ctx: { role?: string } }) => (ctx.role === 'admin' ? 'auto' : 'forbidden');

      log.push(`admin=${forAgent(guard, { role: 'admin' })}`, `guest=${forAgent(guard, { role: 'guest' })}`);
    },
    expected: ['admin=auto', 'guest=forbidden'],
  },
  {
    id: 'agent2-an-api-guard-function-is-told-the-request-context-too',
    src: 'janux',
    run: (log) => {
      const guard = ({ ctx }: { ctx: { tier?: string } }) => (ctx.tier === 'pro' ? 'auto' : 'forbidden');

      log.push(`pro=${apiGuardFor(guard, { tier: 'pro' })}`, `free=${apiGuardFor(guard, { tier: 'free' })}`);
    },
    expected: ['pro=auto', 'free=omitted'],
  },
  {
    id: 'agent2-a-guard-that-throws-denies-instead-of-propagating',
    src: 'janux',
    run: (log) => {
      attempt(log, 'resolve', () =>
        log.push(
          forAgent(() => {
            throw new Error('guard blew up');
          }),
        ),
      );
    },
    expected: ['forbidden', 'resolve:ok'],
  },
  {
    id: 'agent2-an-api-guard-that-throws-denies-instead-of-propagating',
    src: 'janux',
    run: (log) => {
      attempt(log, 'resolve', () =>
        log.push(
          apiGuardFor(() => {
            throw new Error('guard blew up');
          }),
        ),
      );
    },
    expected: ['omitted', 'resolve:ok'],
  },

  // ── anything that is not one of the three answers is not an answer ──────────
  {
    id: 'agent2-an-async-guard-on-an-intent-denies-rather-than-passing-a-promise-through',
    src: 'janux',
    run: (log) => log.push(forAgent(async () => 'auto')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-an-async-guard-resolving-to-forbidden-denies-as-well',
    src: 'janux',
    run: (log) => log.push(forAgent(async () => 'forbidden')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-an-async-guard-on-an-api-tool-denies',
    src: 'janux',
    run: (log) => log.push(apiGuardFor(async () => 'auto')),
    expected: ['omitted'],
  },
  {
    id: 'agent2-a-guard-answering-undefined-denies',
    src: 'janux',
    run: (log) => log.push(forAgent(() => undefined)),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-a-guard-answering-null-denies',
    src: 'janux',
    run: (log) => log.push(forAgent(() => null)),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-a-mistyped-guard-value-denies',
    src: 'janux',
    run: (log) => log.push(forAgent(() => 'allow')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-guard-values-are-matched-case-sensitively',
    src: 'janux',
    run: (log) => log.push(forAgent(() => 'Auto')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-a-guard-value-with-stray-whitespace-denies',
    src: 'janux',
    run: (log) => log.push(forAgent(() => ' auto')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-a-truthy-non-string-guard-answer-denies',
    src: 'janux',
    run: (log) => log.push(forAgent(() => 1)),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-an-object-guard-answer-denies',
    src: 'janux',
    run: (log) => log.push(forAgent(() => ({ guard: 'auto' }))),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-a-mistyped-static-guard-denies',
    src: 'janux',
    run: (log) => log.push(forAgent('allowed')),
    expected: ['forbidden'],
  },
  {
    id: 'agent2-a-mistyped-static-api-guard-denies',
    src: 'janux',
    run: (log) => log.push(apiGuardFor('always')),
    expected: ['omitted'],
  },
  {
    id: 'agent2-a-mistyped-api-guard-value-denies',
    src: 'janux',
    run: (log) => log.push(apiGuardFor(() => 'yes')),
    expected: ['omitted'],
  },
  {
    id: 'agent2-both-faces-answer-the-same-way-to-an-unusable-guard',
    src: 'janux',
    run: (log) => {
      const answers = [async () => 'auto', () => undefined, () => 'nope', 'typo'].map(
        (guard) => `${forAgent(guard)}/${apiGuardFor(guard) === 'omitted' ? 'forbidden' : apiGuardFor(guard)}`,
      );

      log.push([...new Set(answers)].join(','));
    },
    expected: ['forbidden/forbidden'],
  },

  // ── what a denied guard does to the surface ────────────────────────────────
  {
    id: 'agent2-an-async-guard-keeps-its-intent-out-of-the-manifest',
    src: 'janux',
    run: (log) => log.push(toolNames(async () => 'auto')),
    expected: ['none'],
  },
  {
    id: 'agent2-a-mistyped-guard-keeps-its-intent-out-of-the-manifest',
    src: 'janux',
    run: (log) => log.push(toolNames(() => 'sure')),
    expected: ['none'],
  },
  {
    id: 'agent2-a-usable-guard-keeps-its-intent-in-the-manifest',
    src: 'janux',
    run: (log) => log.push(toolNames(() => 'confirm')),
    expected: ['thing.act'],
  },
  {
    id: 'agent2-an-async-guard-refuses-an-agent-invocation',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(async () => 'auto');

      await attempt(log, 'call', () => instance.intents.act!(undefined, { origin: 'agent' }));
      log.push(`n=${instance.state.n}`);
    },
    expected: ['call:threw:Intent "thing.act" is not available', 'n=0'],
  },
  {
    id: 'agent2-a-mistyped-guard-refuses-an-agent-invocation',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(() => 'always');

      await attempt(log, 'call', () => instance.intents.act!(undefined, { origin: 'agent' }));
    },
    expected: ['call:threw:Intent "thing.act" is not available'],
  },
  {
    id: 'agent2-a-denied-guard-still-lets-a-human-use-their-own-ui',
    src: 'janux',
    run: async (log) => {
      const { instance } = mounted(async () => 'auto');

      await instance.intents.act!(undefined, { origin: 'human' });
      log.push(`n=${instance.state.n}`);
    },
    expected: ['n=1'],
  },
  {
    id: 'agent2-the-audit-trail-records-the-denial-as-forbidden',
    src: 'janux',
    run: async (log) => {
      const { instance, audits } = mounted(async () => 'auto');

      await attempt(log, 'call', () => instance.intents.act!(undefined, { origin: 'agent' }));
      log.push(`${audits[0]!.tool} ${audits[0]!.guard} ${audits[0]!.origin} ok=${audits[0]!.ok}`);
    },
    expected: ['call:threw:Intent "thing.act" is not available', 'thing.act forbidden agent ok=false'],
  },
  {
    id: 'agent2-an-async-guard-refuses-an-agent-api-call',
    src: 'janux',
    run: async (log) => {
      const unusable = tool({ description: 'x', guard: async () => 'auto', run: () => 'ran' });

      await attempt(log, 'call', () => invokeApi(unusable, {}, {}, 'agent'));
    },
    expected: ['call:threw:Tool "shop.t" is not available'],
  },
  {
    id: 'agent2-an-async-guard-still-lets-the-app-itself-call-the-api',
    src: 'janux',
    run: async (log) => {
      const unusable = tool({ description: 'x', guard: async () => 'auto', run: () => 'ran' });

      log.push(String(await invokeApi(unusable, {}, {}, 'human')));
    },
    expected: ['ran'],
  },
  {
    id: 'agent2-a-denied-api-guard-is-audited-as-forbidden',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const unusable = tool({ description: 'x', guard: () => 'maybe', run: () => 'ran' });

      await attempt(log, 'call', () => invokeApi(unusable, {}, {}, 'agent', (entry) => audits.push(entry)));
      log.push(`${audits[0]!.tool} ${audits[0]!.guard} ok=${audits[0]!.ok}`);
    },
    expected: ['call:threw:Tool "shop.t" is not available', 'api.shop.t forbidden ok=false'],
  },

  // ── one resolution per listing ──────────────────────────────────────────────
  {
    id: 'agent2-a-guard-answering-differently-each-call-is-never-advertised-as-forbidden',
    src: 'janux',
    run: (log) => {
      let calls = 0;
      const flaky = () => (calls++ % 2 === 0 ? 'auto' : 'forbidden');
      const listed = apiManifestTools([tool({ description: 'x', guard: flaky, run: () => 1 })], {});

      log.push(listed.map((entry) => entry.guard).join(',') || 'omitted');
    },
    expected: ['auto'],
  },
  {
    id: 'agent2-a-flaky-guard-is-resolved-once-per-manifest-tool',
    src: 'janux',
    run: (log) => {
      let calls = 0;
      const flaky = () => {
        calls += 1;

        return 'auto';
      };

      apiManifestTools([tool({ description: 'x', guard: flaky, run: () => 1 })], {});
      log.push(`resolutions=${calls}`);
    },
    expected: ['resolutions=1'],
  },
  {
    id: 'agent2-a-flaky-intent-guard-is-resolved-once-per-manifest-entry',
    src: 'janux',
    run: (log) => {
      let calls = 0;

      buildManifest([
        {
          def: guarded(() => {
            calls += 1;

            return 'auto';
          }) as never,
        },
      ]);
      log.push(`resolutions=${calls}`);
    },
    expected: ['resolutions=1'],
  },

  // ── the manifest projection of an api() tool ────────────────────────────────
  {
    id: 'agent2-an-api-manifest-tool-is-namespaced-under-api',
    src: 'janux',
    run: (log) => log.push(apiManifestTools([tool({ description: 'x', run: () => 1 })], {})[0]!.name),
    expected: ['api.shop.t'],
  },
  {
    id: 'agent2-an-api-manifest-tool-projects-its-input-as-json-schema',
    src: 'janux',
    run: (log) => {
      const withInput = tool({ description: 'x', input: schema({ q: str() }), run: () => 1 });

      log.push(JSON.stringify(apiManifestTools([withInput], {})[0]!.input));
    },
    expected: ['{"type":"object","properties":{"q":{"type":"string"}},"required":["q"],"additionalProperties":false}'],
  },
  {
    id: 'agent2-an-api-manifest-tool-without-an-input-advertises-none',
    src: 'janux',
    run: (log) => log.push(String(apiManifestTools([tool({ description: 'x', run: () => 1 })], {})[0]!.input)),
    expected: ['undefined'],
  },
  {
    id: 'agent2-an-api-manifest-tool-without-a-description-advertises-none',
    src: 'janux',
    run: (log) => log.push(String(apiManifestTools([tool({ run: () => 1 })], {})[0]!.description)),
    expected: ['undefined'],
  },
  {
    id: 'agent2-an-empty-api-surface-projects-an-empty-tool-list',
    src: 'janux',
    run: (log) => log.push(String(apiManifestTools([], {}).length)),
    expected: ['0'],
  },
  {
    id: 'agent2-api-manifest-tools-keep-the-declaration-order',
    src: 'janux',
    run: (log) => {
      const tools = ['a', 'b', 'c'].map((name) => ({ name, run: () => 1 }) as ApiTool);

      log.push(apiManifestTools(tools, {}).map((entry) => entry.name).join(','));
    },
    expected: ['api.a,api.b,api.c'],
  },

  // ── collecting api() exports into tools ─────────────────────────────────────
  {
    id: 'agent2-collecting-apis-namespaces-them-by-module',
    src: 'janux',
    run: (log) => {
      const tools = collectApis({ shop: { read: api({ run: () => 1 }), pay: api({ run: () => 2 }) } });

      log.push(tools.map((entry) => entry.name).join(','));
    },
    expected: ['shop.read,shop.pay'],
  },
  {
    id: 'agent2-collecting-apis-ignores-exports-that-are-not-apis',
    src: 'janux',
    run: (log) => {
      const tools = collectApis({ shop: { read: api({ run: () => 1 }), VERSION: '1.0', helper: () => 'x' } });

      log.push(tools.map((entry) => entry.name).join(','));
    },
    expected: ['shop.read'],
  },
  {
    id: 'agent2-collecting-apis-carries-the-guard-and-the-description',
    src: 'janux',
    run: (log) => {
      const [collected] = collectApis({ shop: { pay: api({ description: 'Pay', guard: 'confirm', run: () => 1 }) } });

      log.push(`${collected!.description} ${collected!.guard}`);
    },
    expected: ['Pay confirm'],
  },
  {
    id: 'agent2-an-api-name-may-not-contain-the-reserved-wire-separator',
    src: 'janux',
    run: (log) => {
      attempt(log, 'collect', () => collectApis({ shop: { read__all: api({ run: () => 1 }) } }));
    },
    expected: ['collect:threw:Janux: api name "shop.read__all" may not contain "__" (reserved for tool wire names)'],
  },
  {
    id: 'agent2-a-module-name-carrying-the-reserved-separator-is-refused-too',
    src: 'janux',
    run: (log) => {
      attempt(log, 'collect', () => collectApis({ my__shop: { read: api({ run: () => 1 }) } }));
    },
    expected: ['collect:threw:Janux: api name "my__shop.read" may not contain "__" (reserved for tool wire names)'],
  },
  {
    id: 'agent2-collecting-from-no-modules-yields-no-tools',
    src: 'janux',
    run: (log) => log.push(String(collectApis({}).length)),
    expected: ['0'],
  },
  {
    id: 'agent2-an-api-is-recognisable-as-one',
    src: 'janux',
    run: (log) => log.push(`api=${isApi(api({ run: () => 1 }))} plain=${isApi(() => 1)} null=${isApi(null)}`),
    expected: ['api=true plain=false null=false'],
  },
  {
    id: 'agent2-an-api-without-a-run-is-refused-at-definition-time',
    src: 'janux',
    run: (log) => {
      attempt(log, 'define', () => api({} as never));
    },
    expected: ['define:threw:Janux: api() requires run()'],
  },

  // ── the invocation pipeline around the guard ────────────────────────────────
  {
    id: 'agent2-an-api-call-validates-its-input-before-running',
    src: 'janux',
    run: async (log) => {
      const typed = tool({ input: schema({ q: str() }), run: () => 'ran' });

      await attempt(log, 'call', () => invokeApi(typed, { q: 7 }, {}, 'agent'));
    },
    expected: ['call:threw:Invalid input for "shop.t" — q: expected string'],
  },
  {
    id: 'agent2-an-api-call-strips-undeclared-input-fields',
    src: 'janux',
    run: async (log) => {
      const typed = tool({ input: schema({ q: str() }), run: ({ input }: { input: unknown }) => input });

      log.push(JSON.stringify(await invokeApi(typed, { q: 'kept', extra: 'dropped' }, {}, 'agent')));
    },
    expected: ['{"q":"kept"}'],
  },
  {
    id: 'agent2-an-api-without-an-input-schema-receives-nothing',
    src: 'janux',
    run: async (log) => {
      const untyped = tool({ run: ({ input }: { input: unknown }) => String(input) });

      log.push(String(await invokeApi(untyped, { smuggled: true }, {}, 'agent')));
    },
    expected: ['undefined'],
  },
  {
    id: 'agent2-an-api-that-returns-the-wrong-shape-fails-loudly',
    src: 'janux',
    run: async (log) => {
      const typed = tool({ output: schema({ ok: str() }), run: () => ({ ok: 1 }) });

      await attempt(log, 'call', () => invokeApi(typed, {}, {}, 'agent'));
    },
    expected: ['call:threw:Janux: api "shop.t" returned an invalid output'],
  },
  {
    id: 'agent2-an-api-output-schema-strips-what-it-does-not-declare',
    src: 'janux',
    run: async (log) => {
      const typed = tool({ output: schema({ ok: str() }), run: () => ({ ok: 'yes', secret: 'no' }) });

      log.push(JSON.stringify(await invokeApi(typed, {}, {}, 'agent')));
    },
    expected: ['{"ok":"yes"}'],
  },
  {
    id: 'agent2-an-api-run-is-told-which-face-called-it',
    src: 'janux',
    run: async (log) => {
      const echo = tool({ run: ({ origin }: { origin: string }) => origin });

      log.push(String(await invokeApi(echo, {}, {}, 'agent')), String(await invokeApi(echo, {}, {}, 'human')));
    },
    expected: ['agent', 'human'],
  },
  {
    id: 'agent2-an-api-run-is-handed-the-request-context',
    src: 'janux',
    run: async (log) => {
      const echo = tool({ run: ({ ctx }: { ctx: { user?: string } }) => ctx.user });

      log.push(String(await invokeApi(echo, {}, { user: 'ada' } as never, 'agent')));
    },
    expected: ['ada'],
  },
  {
    id: 'agent2-a-successful-api-call-is-audited-with-the-parsed-input',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const typed = tool({ input: schema({ q: str() }), run: () => 'ran' });

      await invokeApi(typed, { q: 'x', extra: 1 }, {}, 'agent', (entry) => audits.push(entry));
      log.push(`${audits[0]!.tool} ok=${audits[0]!.ok} ${JSON.stringify(audits[0]!.input)}`);
    },
    expected: ['api.shop.t ok=true {"q":"x"}'],
  },
  {
    id: 'agent2-a-failed-api-call-is-audited-with-the-raw-input',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const typed = tool({ input: schema({ q: str() }), run: () => 'ran' });

      await attempt(log, 'call', () => invokeApi(typed, { q: 7 }, {}, 'agent', (entry) => audits.push(entry)));
      log.push(`ok=${audits[0]!.ok} ${JSON.stringify(audits[0]!.input)}`);
    },
    expected: ['call:threw:Invalid input for "shop.t" — q: expected string', 'ok=false {"q":7}'],
  },
  {
    id: 'agent2-an-audit-entry-carries-no-agent-key-when-nobody-signed',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];

      await invokeApi(tool({ run: () => 1 }), {}, {}, 'agent', (entry) => audits.push(entry));
      log.push(`agent=${String(audits[0]!.agent)}`);
    },
    expected: ['agent=undefined'],
  },
  {
    id: 'agent2-an-audit-entry-carries-the-verified-agent-key-when-one-signed',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const ctx = { agent: { verified: true, keyId: 'key-1' } } as never;

      await invokeApi(tool({ run: () => 1 }), {}, ctx, 'agent', (entry) => audits.push(entry));
      log.push(String(audits[0]!.agent));
    },
    expected: ['key-1'],
  },
  {
    id: 'agent2-an-unverified-agent-identity-is-not-recorded-as-a-key',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const ctx = { agent: { verified: false, keyId: 'key-1' } } as never;

      await invokeApi(tool({ run: () => 1 }), {}, ctx, 'agent', (entry) => audits.push(entry));
      log.push(`agent=${String(audits[0]!.agent)}`);
    },
    expected: ['agent=undefined'],
  },
  {
    id: 'agent2-a-throwing-api-is-audited-before-the-error-escapes',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const broken = tool({
        run: () => {
          throw new Error('inner');
        },
      });

      await attempt(log, 'call', () => invokeApi(broken, {}, {}, 'agent', (entry) => audits.push(entry)));
      log.push(`ok=${audits[0]!.ok} error=${audits[0]!.error}`);
    },
    expected: ['call:threw:inner', 'ok=false error=Error: inner'],
  },
  {
    id: 'agent2-an-async-api-is-awaited-before-it-is-audited',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const slow = tool({ run: async () => 'late' });

      log.push(String(await invokeApi(slow, {}, {}, 'agent', (entry) => audits.push(entry))));
      log.push(`audits=${audits.length} ok=${audits[0]!.ok}`);
    },
    expected: ['late', 'audits=1 ok=true'],
  },
  {
    id: 'agent2-a-rejecting-async-api-is-audited-as-a-failure',
    src: 'janux',
    run: async (log) => {
      const audits: AuditEntry[] = [];
      const slow = tool({ run: async () => Promise.reject(new Error('late failure')) });

      await attempt(log, 'call', () => invokeApi(slow, {}, {}, 'agent', (entry) => audits.push(entry)));
      log.push(`ok=${audits[0]!.ok}`);
    },
    expected: ['call:threw:late failure', 'ok=false'],
  },
  {
    id: 'agent2-a-callable-api-runs-as-a-human-when-the-app-calls-it-directly',
    src: 'janux',
    run: async (log) => {
      const closed = api({ guard: 'forbidden', run: ({ origin }) => origin });

      log.push(String(await closed()));
    },
    expected: ['human'],
  },
  {
    id: 'agent2-a-callable-api-validates-its-input-like-any-other-caller',
    src: 'janux',
    run: async (log) => {
      const typed = api({ input: schema({ q: str() }), run: ({ input }) => input });

      await attempt(log, 'call', () => typed({ q: 7 }));
    },
    expected: ['call:threw:Invalid input for "inline" — q: expected string'],
  },
];
