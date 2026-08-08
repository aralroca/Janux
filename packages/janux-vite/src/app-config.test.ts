import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiFiles, mcpAuthOptions, publishAppRoot, resolveAppConfig, routingOptions, toPosix } from './app-config';

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-app-'));

  Object.entries(files).forEach(([name, content]) => writeFileSync(join(root, name), content));

  return root;
}

function appWithPackageJson(json: unknown): string {
  return app({ 'package.json': JSON.stringify(json) });
}

describe('resolveAppConfig janux.config.ts', () => {
  it('reads options from the config file default export', async () => {
    const root = app({ 'janux.config.ts': `export default { title: 'My App', llmsTxt: { description: 'An app.' } };` });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('My App');
    expect(config.llmsTxt).toEqual({ description: 'An app.' });
  });

  it('wins over the deprecated package.json "janux" field', async () => {
    const root = app({
      'package.json': JSON.stringify({ name: 'x', janux: { title: 'From pkg', output: 'static' } }),
      'janux.config.ts': `export default { title: 'From file' };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('From file');
    expect(config.output).toBe('static');
  });

  it('lets explicit plugin options win over the config file', async () => {
    const root = app({ 'janux.config.ts': `export default { title: 'From file' };` });

    expect((await resolveAppConfig(root, { title: 'From plugin' })).title).toBe('From plugin');
  });

  it('re-reads the config file after an edit, mid-process', async () => {
    // What `janux dev` does on every server rebuild. Bun keys its module
    // cache on the file path and ignores the `?v=` mtime query, so without
    // an explicit eviction every dev session is stuck with the config it
    // booted with, and only a restart picks up janux.config.ts edits.
    const root = app({ 'janux.config.ts': `export default { title: 'Before edit' };` });

    expect((await resolveAppConfig(root)).title).toBe('Before edit');
    writeFileSync(join(root, 'janux.config.ts'), `export default { title: 'After edit' };`);
    // A same-millisecond rewrite would also defeat Node's mtime query.
    utimesSync(join(root, 'janux.config.ts'), new Date(), new Date(Date.now() + 5));
    expect((await resolveAppConfig(root)).title).toBe('After edit');
  });
});

describe('resolveAppConfig package.json "janux" field (deprecated fallback)', () => {
  it('reads llmsTxt and title from the app package.json', async () => {
    const root = appWithPackageJson({
      name: 'x',
      janux: { title: 'My App', llmsTxt: { description: 'An app.' } },
    });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('My App');
    expect(config.llmsTxt).toEqual({ description: 'An app.' });
  });

  it('defaults output to "bun" and reads "static" from the config', async () => {
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x' }))).output).toBe('bun');
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x', janux: { output: 'static' } }))).output).toBe('static');
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x' }), { output: 'static' })).output).toBe('static');
  });

  it('tolerates apps without a package.json or without the field', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-app-'));

    expect((await resolveAppConfig(root)).llmsTxt).toBeUndefined();
    expect((await resolveAppConfig(appWithPackageJson({ name: 'x' }))).llmsTxt).toBeUndefined();
  });
});

describe('resolveAppConfig src/ctx.ts', () => {
  it('picks up the ctx convention when the file exists', async () => {
    const root = app({ 'package.json': '{"name":"x"}' });

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/ctx.ts'), 'export default (req: Request) => ({ userId: null });');

    expect((await resolveAppConfig(root)).ctxModule).toBe(join(root, 'src/ctx.ts'));
  });

  it('leaves it undefined when the app has no ctx.ts (ctx stays {})', async () => {
    const root = app({ 'package.json': '{"name":"x"}' });

    expect((await resolveAppConfig(root)).ctxModule).toBeUndefined();
  });
});

describe('resolveAppConfig src/session.ts', () => {
  it('picks up the session convention when the file exists', async () => {
    const root = app({ 'package.json': '{"name":"x"}' });

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/session.ts'), 'export default {} as never;');

    expect((await resolveAppConfig(root)).sessionModule).toBe(join(root, 'src/session.ts'));
  });

  it('leaves it undefined when the app has no session.ts (an app without sessions pays nothing)', async () => {
    const root = app({ 'package.json': '{"name":"x"}' });

    expect((await resolveAppConfig(root)).sessionModule).toBeUndefined();
  });
});

describe('resolveAppConfig schedules directory', () => {
  it('resolves src/schedules by convention when it exists', async () => {
    const root = app({});

    mkdirSync(join(root, 'src/schedules'), { recursive: true });

    expect((await resolveAppConfig(root)).schedulesDir).toBe(join(root, 'src/schedules'));
  });

  it('is undefined without the directory', async () => {
    expect((await resolveAppConfig(app({}))).schedulesDir).toBeUndefined();
  });
});

describe('resolveAppConfig skills directory', () => {
  function appWithSkill(source: string): string {
    const root = app({});

    mkdirSync(join(root, 'src/skills'), { recursive: true });
    writeFileSync(join(root, 'src/skills/refund.md'), source);

    return root;
  }

  it('discovers src/skills by convention, parsed and ready to serve', async () => {
    const root = appWithSkill('---\ndescription: Refund an order\ntools: [api.shop.refund]\n---\nSteps here.\n');
    const { skills } = await resolveAppConfig(root);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: 'refund', description: 'Refund an order', tools: ['api.shop.refund'] });
    expect(skills[0]!.body).toBe('Steps here.\n');
  });

  it('is an empty list for an app with no skills, so nothing downstream branches', async () => {
    expect((await resolveAppConfig(app({}))).skills).toEqual([]);
  });

  it('refuses to boot on a broken skill instead of serving a half-index', async () => {
    const root = appWithSkill('---\nwhen: sometimes\n---\nNo description.\n');

    expect(resolveAppConfig(root)).rejects.toThrow(/description/);
  });
});

describe('resolveAppConfig websocket module', () => {
  it('resolves src/ws.ts by convention', async () => {
    const root = app({});

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/ws.ts'), 'export default { path: "/ws" };');

    expect((await resolveAppConfig(root)).websocketModule).toBe(join(root, 'src/ws.ts'));
  });

  it('lets the config point somewhere else', async () => {
    const root = app({ 'janux.config.ts': `export default { websocket: 'src/live.ts' };` });

    expect((await resolveAppConfig(root)).websocketModule).toBe(join(root, 'src/live.ts'));
  });

  it('is undefined without the file', async () => {
    expect((await resolveAppConfig(app({}))).websocketModule).toBeUndefined();
  });
});

describe('resolveAppConfig mcpAuth and agents', () => {
  it('passes both through from the config file', async () => {
    const root = app({
      'janux.config.ts': `export default {
        mcpAuth: { token: 'demo', resourceMetadataUrl: 'https://x/meta' },
        agents: { webBotAuth: { keys: [] }, policy: 'require' },
      };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.mcpAuth).toEqual({ token: 'demo', resourceMetadataUrl: 'https://x/meta' });
    expect(config.agents).toEqual({ webBotAuth: { keys: [] }, policy: 'require' });
  });
});

/**
 * The migration map has to reach the server the same way in dev and in prod —
 * `routingOptions` is the one mapping both sides call, for the same reason
 * `shellOptions` exists: the field wired in one and forgotten in the other.
 */
describe('resolveAppConfig redirects and rewrites', () => {
  it('passes both through from the config file', async () => {
    const root = app({
      'janux.config.ts': `export default {
        redirects: [{ from: '/blog/[slug]', to: '/posts/[slug]', status: 301 }],
        rewrites: [{ from: '/help/[...path]', to: '/docs/[...path]' }],
      };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.redirects).toEqual([{ from: '/blog/[slug]', to: '/posts/[slug]', status: 301 }]);
    expect(config.rewrites).toEqual([{ from: '/help/[...path]', to: '/docs/[...path]' }]);
  });

  it('leaves them undefined for an app that declares none', async () => {
    const config = await resolveAppConfig(app({ 'janux.config.ts': `export default {};` }));

    expect(config.redirects).toBeUndefined();
    expect(config.rewrites).toBeUndefined();
    expect(routingOptions(config)).toEqual({ redirects: undefined, rewrites: undefined });
  });

  it('routingOptions carries exactly what the server takes', async () => {
    const root = app({ 'janux.config.ts': `export default { redirects: [{ from: '/a', to: '/b' }] };` });

    expect(routingOptions(await resolveAppConfig(root))).toEqual({ redirects: [{ from: '/a', to: '/b' }], rewrites: undefined });
  });
});

describe('mcpAuthOptions', () => {
  it('maps a literal token to a bearer verifier', () => {
    const auth = mcpAuthOptions({ token: 'demo' })!;

    expect(auth.verify('demo', new Request('http://x'))).toBeTruthy();
    expect(auth.verify('wrong', new Request('http://x'))).toBeNull();
  });

  it('prefers the env var over the literal and remembers the metadata url', () => {
    process.env.JANUX_TEST_MCP_TOKEN = 'from-env';
    const auth = mcpAuthOptions({ tokenEnv: 'JANUX_TEST_MCP_TOKEN', token: 'demo', resourceMetadataUrl: 'https://x/meta' })!;

    expect(auth.verify('from-env', new Request('http://x'))).toBeTruthy();
    expect(auth.verify('demo', new Request('http://x'))).toBeNull();
    expect(auth.resourceMetadataUrl).toBe('https://x/meta');
    delete process.env.JANUX_TEST_MCP_TOKEN;
  });

  it('falls back to the literal when the env var is unset', () => {
    expect(mcpAuthOptions({ tokenEnv: 'JANUX_TEST_MCP_UNSET', token: 'demo' })!.verify('demo', new Request('http://x'))).toBeTruthy();
  });

  it('is off entirely when no protection was declared', () => {
    expect(mcpAuthOptions(undefined)).toBeUndefined();
    expect(mcpAuthOptions({})).toBeUndefined();
  });

  /**
   * Declaring `tokenEnv` states the endpoint is protected. Serving it open
   * because a secret is missing from the deploy inverts that intent silently —
   * every api() tool would answer any anonymous MCP client.
   */
  it('refuses to boot when the declared tokenEnv is missing, instead of failing open', () => {
    expect(() => mcpAuthOptions({ tokenEnv: 'JANUX_TEST_MCP_UNSET' })).toThrow(/JANUX_TEST_MCP_UNSET/);
  });
});

/**
 * The stylesheet entry used to be spelled `src/styles.css` and nothing else, so
 * a Sass app had no way to name its own entry: `janux build` bundled no styles
 * and the shell linked a sheet that was never emitted.
 */
describe('resolveAppConfig stylesheet', () => {
  function appWithStyles(name: string): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-styles-'));

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', name), 'body { color: red; }');

    return root;
  }

  it('resolves the plain CSS entry', async () => {
    const root = appWithStyles('styles.css');

    expect((await resolveAppConfig(root)).stylesheet).toBe(join(root, 'src/styles.css'));
  });

  it.each(['styles.scss', 'styles.sass', 'styles.less'])('resolves the %s entry', async (name) => {
    const root = appWithStyles(name);

    expect((await resolveAppConfig(root)).stylesheet).toBe(join(root, 'src', name));
  });

  it('prefers plain CSS when an app happens to have both', async () => {
    const root = appWithStyles('styles.css');

    writeFileSync(join(root, 'src', 'styles.scss'), '$c: red; body { color: $c; }');
    expect((await resolveAppConfig(root)).stylesheet).toBe(join(root, 'src/styles.css'));
  });

  it('leaves the stylesheet undefined when the app has none', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-styles-'));

    expect((await resolveAppConfig(root)).stylesheet).toBeUndefined();
  });
});

/**
 * The conventions themselves. Every one of them is "the file is there, so the
 * feature is on" — which is what makes a missed one silent: no config says the
 * app has middleware, so nothing says it stopped running either.
 */
describe('resolveAppConfig conventions', () => {
  function appWithSources(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-conv-'));

    Object.entries(files).forEach(([name, content]) => {
      mkdirSync(join(root, name, '..'), { recursive: true });
      writeFileSync(join(root, name), content);
    });

    return root;
  }

  // The config carries native paths — backslashed on Windows — while the
  // conventions below are spelled the one way they read on every OS. `toPosix`
  // for the fields that always have a value, this for the ones that may not.
  const conventionOf = (path: string | undefined) => (path === undefined ? undefined : toPosix(path));

  it('defaults the routes and server directories to the conventional ones', async () => {
    const config = await resolveAppConfig(appWithSources({}));

    expect(toPosix(config.routesDir).endsWith('/src/routes')).toBe(true);
    expect(toPosix(config.serverDir).endsWith('/src/server')).toBe(true);
  });

  it('lets the config move the routes and server directories', async () => {
    const root = appWithSources({ 'janux.config.ts': `export default { routesDir: 'app/pages', serverDir: 'app/rpc' };` });
    const config = await resolveAppConfig(root);

    expect(config.routesDir).toBe(join(root, 'app/pages'));
    expect(config.serverDir).toBe(join(root, 'app/rpc'));
  });

  it('resolves the client entry only when the app wrote one', async () => {
    expect((await resolveAppConfig(appWithSources({}))).clientEntry).toBe('');
    const written = await resolveAppConfig(appWithSources({ 'src/client.ts': 'export {};' }));

    expect(toPosix(written.clientEntry)).toEndWith('/src/client.ts');
  });

  it('picks up the middleware, agent and stores conventions', async () => {
    const config = await resolveAppConfig(
      appWithSources({ 'src/middleware.ts': 'export default 1;', 'src/agent.ts': 'export default 1;', 'src/stores.ts': 'export default 1;' }),
    );

    expect(conventionOf(config.middlewareModule)).toEndWith('/src/middleware.ts');
    expect(conventionOf(config.agentModule)).toEndWith('/src/agent.ts');
    expect(conventionOf(config.storesModule)).toEndWith('/src/stores.ts');
  });

  it('accepts i18n as a directory as well as a file', async () => {
    const single = await resolveAppConfig(appWithSources({ 'src/i18n.ts': 'export default {};' }));
    const nested = await resolveAppConfig(appWithSources({ 'src/i18n/index.ts': 'export default {};' }));

    expect(conventionOf(single.i18nModule)).toEndWith('/src/i18n.ts');
    expect(conventionOf(nested.i18nModule)).toEndWith('/src/i18n/index.ts');
  });

  it('picks up src/instrumentation.ts, which nothing else in the app declares', async () => {
    const config = await resolveAppConfig(appWithSources({ 'src/instrumentation.ts': 'export function register() {}' }));

    expect(conventionOf(config.instrumentationModule)).toEndWith('/src/instrumentation.ts');
    expect((await resolveAppConfig(appWithSources({}))).instrumentationModule).toBeUndefined();
  });

  it('links the favicon only when public/favicon.svg is really there', async () => {
    expect((await resolveAppConfig(appWithSources({}))).favicon).toBeUndefined();
    expect((await resolveAppConfig(appWithSources({ 'public/favicon.svg': '<svg/>' }))).favicon).toBe('/favicon.svg');
  });

  it('claims the http handlers directory only when the app has one', async () => {
    expect((await resolveAppConfig(appWithSources({}))).httpHandlersDir).toBeUndefined();
    expect(
      conventionOf((await resolveAppConfig(appWithSources({ 'src/api/webhook.ts': 'export {};' }))).httpHandlersDir),
    ).toEndWith('/src/api');
  });

  it('declares no fonts for an app that asked for none', async () => {
    expect((await resolveAppConfig(appWithSources({}))).fonts).toEqual([]);
  });

  it('carries the shell policies through untouched', async () => {
    const root = appWithSources({
      'janux.config.ts': `export default { csp: true, cache: { swr: '1m' }, navigation: { prefetch: 'intent' }, siteUrl: 'https://x.dev' };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.csp).toBe(true);
    expect(config.cache).toEqual({ swr: '1m' } as never);
    expect(config.navigation).toEqual({ prefetch: 'intent' } as never);
    expect(config.siteUrl).toBe('https://x.dev');
  });
});

/**
 * Which files become the agent-reachable api surface. The filter is the whole
 * boundary: a file it claims by mistake is projected into fetch stubs in the
 * browser bundle, and one it misses is a tool no agent can reach.
 */
describe('apiFiles', () => {
  function serverDir(names: string[]): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-api-'));

    mkdirSync(join(root, 'src/server'), { recursive: true });
    names.forEach((name) => writeFileSync(join(root, 'src/server', name), 'export {};'));

    return join(root, 'src/server');
  }

  it('takes the .api.ts and .api.js modules and nothing else', () => {
    const dir = serverDir(['shop.api.ts', 'orders.api.js', 'helpers.ts', 'shop.api.tsx', 'notes.md']);

    expect(apiFiles(dir).map((file) => file.slice(dir.length + 1)).sort()).toEqual(['orders.api.js', 'shop.api.ts']);
  });

  it('does not descend into subdirectories, so a nested file is not a tool by accident', () => {
    const dir = serverDir(['shop.api.ts']);

    mkdirSync(join(dir, 'internal'), { recursive: true });
    writeFileSync(join(dir, 'internal/secret.api.ts'), 'export {};');

    expect(apiFiles(dir).map((file) => file.slice(dir.length + 1))).toEqual(['shop.api.ts']);
  });

  it('is empty for an app with no server directory at all', () => {
    expect(apiFiles(join(tmpdir(), 'janux-no-such-server-dir'))).toEqual([]);
  });
});

describe('the app root the framework publishes', () => {
  const previous = process.env.JANUX_APP_ROOT;

  afterEach(() => {
    if (previous === undefined) delete process.env.JANUX_APP_ROOT;
    else process.env.JANUX_APP_ROOT = previous;
  });

  /**
   * An app's own modules locate their data files through `JANUX_APP_ROOT` — the
   * convention the Vercel adapter established because a bundle's
   * `import.meta.dirname` is not the app's.
   */
  it('publishes the root an app is served from', () => {
    publishAppRoot('/srv/app');

    expect(process.env.JANUX_APP_ROOT).toBe('/srv/app');
  });

  /**
   * Reading a config is not running an app. Tooling resolves the config of apps
   * it will never serve — a test harness, a monorepo build — and a root left
   * behind by one of those points a *running* app's modules at someone else's
   * files.
   */
  it('does not publish anything when a config is merely resolved', async () => {
    publishAppRoot('/srv/app');
    await resolveAppConfig(app({ 'janux.config.ts': 'export default {};' }));

    expect(process.env.JANUX_APP_ROOT).toBe('/srv/app');
  });
});

/**
 * Everything the framework derives from `relative()` — generated import
 * specifiers, dev URLs, the route reports `janux info` prints — must read the
 * same on Windows, where `relative()` answers with backslashes. This is the one
 * normalization those call sites share.
 */
describe('toPosix', () => {
  it('turns a Windows-relative path into its forward-slash form', () => {
    expect(toPosix('src\\routes\\index.tsx')).toBe('src/routes/index.tsx');
  });

  it('leaves a POSIX path alone', () => {
    expect(toPosix('src/routes/index.tsx')).toBe('src/routes/index.tsx');
  });
});
