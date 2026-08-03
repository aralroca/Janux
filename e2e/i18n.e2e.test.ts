import { beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from '@janux/testing';
import { appRoot } from './support/app';

let app: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  app = await createTestApp(appRoot('examples/i18n'));
});

describe('examples/i18n end to end', () => {
  it('redirects the bare root to the detected locale', async () => {
    expect((await app.fetch('/')).headers.get('location')).toBe('/en');
    expect((await app.fetch('/', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } })).headers.get('location')).toBe('/fr');
    expect((await app.fetch('/', { headers: { cookie: 'JANUX_LOCALE=es' } })).headers.get('location')).toBe('/es');
  });

  it('renders each locale with its language, direction and translated content', async () => {
    const en = await (await app.fetch('/en')).text();
    const es = await (await app.fetch('/es')).text();

    expect(en).toContain('<html lang="en" dir="ltr">');
    expect(en).toContain('Welcome to Janux i18n');
    expect(es).toContain('<html lang="es" dir="ltr">');
    expect(es).toContain('Bienvenido a Janux i18n');
  });

  it('prefixes internal links but not the language switcher', async () => {
    const html = await (await app.fetch('/es')).text();

    expect(html).toContain('href="/es/about"');
    expect(html).toContain('href="/en"');
    expect(html).toContain('href="/fr"');
  });

  it('ships only the island translations, including interaction-only i18nKeys', async () => {
    const html = await (await app.fetch('/fr')).text();
    const payload = JSON.parse(/janux\+i18n"[^>]*>(.+?)<\/script>/.exec(html)![1]!);

    expect(Object.keys(payload.messages)).toEqual(['counter']);
    expect(payload.messages.counter.milestone).toBe('Tape m’en cinq ! 🖐️');
    expect(payload.locale).toBe('fr');
  });

  it('embeds no payload on island-less pages', async () => {
    const html = await (await app.fetch('/en/about')).text();

    expect(html).not.toContain('janux+i18n');
    expect(html).toContain('About');
  });

  it('lists every page per locale (drives the static prerender)', async () => {
    expect((await app.server.listPages()).sort()).toEqual([
      '/en',
      '/en/about',
      '/es',
      '/es/about',
      '/fr',
      '/fr/about',
    ]);
  });

  it('translates the page title through meta', async () => {
    expect(await (await app.fetch('/fr/about')).text()).toContain('<title>À propos</title>');
  });
});
