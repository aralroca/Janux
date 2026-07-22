import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, int } from 'janux';
import { createJanuxServer } from './server';
import { detectLocale, localeDir, splitLocale } from './i18n-routing';

const messages = {
  en: {
    title: 'Welcome',
    nav: { about: 'About' },
    counter: { label_one: '{{count}} click', label_other: '{{count}} clicks', reset: 'Reset' },
    server_only: 'Server only',
  },
  es: {
    title: 'Bienvenido',
    nav: { about: 'Sobre nosotros' },
    counter: { label_one: '{{count}} clic', label_other: '{{count}} clics', reset: 'Reiniciar' },
    server_only: 'Solo servidor',
  },
};

const counter = component({
  name: 'counter',
  state: schema({ count: int() }),
  i18nKeys: ['counter.reset'],
  intents: { inc: intent({ run: ({ state }: any) => (state.count += 1) }) },
  view: ({ state, ctx }: any) => jsx('button', { children: ctx.i18n.t('counter.label', { count: state.count }) }),
});

const server = createJanuxServer({
  i18n: { locales: ['en', 'es'], defaultLocale: 'en', messages },
  routes: {
    '/': ({ ctx }) =>
      jsx('main', {
        children: [
          jsx('h1', { children: ctx.i18n!.t('title') }),
          jsx('a', { href: '/about', children: ctx.i18n!.t('nav.about') }),
          jsx('a', { href: '/es', children: 'ES' }),
          jsx(counter as any, {}),
        ],
      }),
    '/about': ({ ctx }) => jsx('p', { children: ctx.i18n!.t('server_only') }),
  },
  runtimeUrl: '/client.js',
});

const get = (path: string, headers: Record<string, string> = {}) =>
  server.fetch(new Request(`http://test${path}`, { headers }));

function embeddedI18n(html: string): { locale: string; messages: Record<string, unknown> } {
  const match = /<script type="application\/janux\+i18n" id="jx-i18n">(.+?)<\/script>/.exec(html);

  expect(match).not.toBeNull();

  return JSON.parse(match![1]!);
}

describe('i18n routing', () => {
  it('redirects unprefixed pages to the default locale', async () => {
    const response = await get('/');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/en');
  });

  it('detects the locale from accept-language', async () => {
    const response = await get('/about', { 'accept-language': 'es-ES,es;q=0.9,en;q=0.5' });

    expect(response.headers.get('location')).toBe('/es/about');
  });

  it('lets the JANUX_LOCALE cookie win over accept-language', async () => {
    const response = await get('/', { 'accept-language': 'en', cookie: 'JANUX_LOCALE=es' });

    expect(response.headers.get('location')).toBe('/es');
  });

  it('preserves the query string on redirect', async () => {
    const response = await get('/about?tab=1');

    expect(response.headers.get('location')).toBe('/en/about?tab=1');
  });

  it('serves the page under its locale prefix with lang and dir', async () => {
    const html = await (await get('/en')).text();

    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('Welcome');
    const es = await (await get('/es')).text();

    expect(es).toContain('<html lang="es" dir="ltr">');
    expect(es).toContain('Bienvenido');
  });
});

describe('i18n server-rendered links', () => {
  it('prefixes internal links with the current locale', async () => {
    const html = await (await get('/es')).text();

    expect(html).toContain('href="/es/about"');
  });

  it('leaves already-prefixed hrefs untouched (language switcher idiom)', async () => {
    const html = await (await get('/en')).text();

    expect(html).toContain('href="/es"');
  });
});

describe('i18n client payload', () => {
  it('ships only the messages the islands consume, plus declared i18nKeys', async () => {
    const { locale, messages: shipped } = embeddedI18n(await (await get('/en')).text());

    expect(locale).toBe('en');
    expect(shipped).toEqual({
      counter: { label_one: '{{count}} click', label_other: '{{count}} clicks', reset: 'Reset' },
    });
  });

  it('embeds no i18n script on pages without islands', async () => {
    const html = await (await get('/es/about')).text();

    expect(html).toContain('Solo servidor');
    expect(html).not.toContain('janux+i18n');
  });
});

describe('i18n pages and manifest', () => {
  it('lists every page per locale', async () => {
    expect((await server.listPages()).sort()).toEqual(['/en', '/en/about', '/es', '/es/about']);
  });

  it('resolves the manifest for a locale-prefixed path', async () => {
    const manifest = (await server.manifestFor('/es', {})) as { resources: unknown[] };

    expect(manifest.resources.length).toBeGreaterThan(0);
  });

  it('falls back to the default locale for unprefixed manifest paths', async () => {
    const manifest = (await server.manifestFor('/', {})) as { resources: unknown[] };

    expect(manifest.resources.length).toBeGreaterThan(0);
  });
});

describe('i18n-routing helpers', () => {
  it('splits supported locale prefixes', () => {
    expect(splitLocale('/es/shop', ['en', 'es'])).toEqual({ locale: 'es', pathname: '/shop' });
    expect(splitLocale('/es', ['en', 'es'])).toEqual({ locale: 'es', pathname: '/' });
    expect(splitLocale('/shop', ['en', 'es'])).toEqual({ pathname: '/shop' });
  });

  it('matches accept-language base tags against regional locales', () => {
    const req = new Request('http://test/', { headers: { 'accept-language': 'pt;q=0.9' } });

    expect(detectLocale(req, { locales: ['en', 'pt-BR'], defaultLocale: 'en' })).toBe('pt-BR');
  });

  it('reports rtl for right-to-left languages', () => {
    expect(localeDir('ar')).toBe('rtl');
    expect(localeDir('en-US')).toBe('ltr');
  });
});
