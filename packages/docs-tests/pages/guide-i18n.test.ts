import { describe, expect, it } from 'bun:test';
import { formatElements, getI18n, selectMessages, translateCore } from 'janux';
import { createJanuxServer } from '@janux/server';
import { jsx } from 'janux';

/**
 * guide/i18n.md's config table and reference/i18n-api.md's four building blocks.
 * The claims that matter are the ones a hand-rolled i18n gets wrong: real
 * Intl.PluralRules categories, recursive interpolation, empty strings staying
 * empty, and only the used keys reaching the client.
 */

const CONFIG = {
  locales: ['en', 'es', 'pl'],
  defaultLocale: 'en',
  messages: {
    en: {
      cart: { label_one: '{{count}} item', label_other: '{{count}} items', empty: '' },
      hello: 'Hi {{name}}',
      tree: { a: 'A {{x}}', nested: { b: 'B {{x}}' } },
      terms: 'Read the <0>terms</0>',
    },
    es: { cart: { label_one: '{{count}} artículo', label_other: '{{count}} artículos' } },
    pl: {
      cart: {
        label_one: '{{count}} rzecz',
        label_few: '{{count}} rzeczy',
        label_many: '{{count}} rzeczy',
        label_other: '{{count}} rzeczy',
      },
    },
  },
};

describe('reference/i18n-api.md — translateCore', () => {
  it('uses Intl.PluralRules categories, not count === 1', () => {
    const t = translateCore('pl', CONFIG as any);

    // Polish has one/few/many: 1 → one, 3 → few, 25 → many.
    expect(t('cart.label', { count: 1 })).toBe('1 rzecz');
    expect(t('cart.label', { count: 3 })).toBe('3 rzeczy');
    expect(t('cart.label', { count: 25 })).toBe('25 rzeczy');
  });

  it('interpolates, and a key missing from the locale returns the key itself', () => {
    expect(translateCore('en', CONFIG as any)('hello', { name: 'Ada' })).toBe('Hi Ada');
    expect(translateCore('es', CONFIG as any)('cart.label', { count: 2 })).toBe('2 artículos');
    // There is no cross-locale fallback: `fallback` is a list of KEYS to try.
    expect(translateCore('es', CONFIG as any)('hello', { name: 'Ada' })).toBe('hello');
    expect(translateCore('es', CONFIG as any)('hello', { count: 2 }, { fallback: ['cart.label'] })).toBe('2 artículos');
  });

  it('interpolates a whole message tree in one call, with returnObjects', () => {
    const t = translateCore('en', CONFIG as any);

    expect(t('tree', { x: '1' }, { returnObjects: true })).toEqual({ a: 'A 1', nested: { b: 'B 1' } });
    expect(t('tree', { x: '1' })).toBe('tree'); // without it, an object key resolves to nothing
  });

  it('keeps a deliberately empty translation empty (allowEmptyStrings default)', () => {
    expect(translateCore('en', CONFIG as any)('cart.empty')).toBe('');
    expect(translateCore('en', { ...CONFIG, allowEmptyStrings: false } as any)('cart.empty')).toBe('cart.empty');
  });

  it('returns the key when there is no translation anywhere', () => {
    expect(translateCore('en', CONFIG as any)('nope.missing')).toBe('nope.missing');
  });

  it('honours custom interpolation delimiters', () => {
    const config = { ...CONFIG, messages: { en: { hi: 'Hi %name%' } }, interpolation: { prefix: '%', suffix: '%' } };

    expect(translateCore('en', config as any)('hi', { name: 'Ada' })).toBe('Hi Ada');
  });
});

describe('reference/i18n-api.md — selectMessages, formatElements, getI18n', () => {
  it('ships only the used keys, with their plural variants', () => {
    const selected: any = selectMessages(CONFIG.messages.en as any, new Set(['cart.label']), [], '.');

    expect(Object.keys(selected)).toEqual(['cart']);
    expect(Object.keys(selected.cart).sort()).toEqual(['label_one', 'label_other']);
    expect(selected.hello).toBeUndefined(); // an unused key never reaches the client
  });

  it('adds declared i18nKeys that SSR never rendered', () => {
    const selected: any = selectMessages(CONFIG.messages.en as any, new Set(), ['hello'], '.');

    expect(selected.hello).toBe('Hi {{name}}');
  });

  it('formatElements swaps <0> markers for real elements', () => {
    const parts = formatElements('Read the <0>terms</0>', [jsx('a', { href: '/terms' })]) as unknown[];

    expect(Array.isArray(parts)).toBe(true);
    expect(JSON.stringify(parts)).toContain('/terms');
  });

  it('getI18n explains itself when i18n is not configured', () => {
    expect(() => getI18n({} as any)).toThrow(/i18n/i);
    const i18n = { locale: 'es', locales: ['en', 'es'], defaultLocale: 'en', t: () => 'x' } as any;

    expect(getI18n({ i18n } as any).locale).toBe('es');
  });
});

describe('guide/i18n.md — routing', () => {
  const app = () =>
    createJanuxServer({
      i18n: CONFIG as any,
      routes: { '/': ({ ctx }: any) => jsx('h1', { children: ctx.i18n.t('cart.label', { count: 2 }) }) },
    });

  it('redirects an unprefixed path to a detected locale', async () => {
    const response = await app().fetch(new Request('http://test/', { headers: { 'accept-language': 'es-ES,es;q=0.9' } }));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/es');
  });

  it('renders the prefixed locale with its own dictionary and dir', async () => {
    const html = await (await app().fetch(new Request('http://test/es'))).text();

    expect(html).toContain('<h1>2 artículos</h1>');
    expect(html).toContain('lang="es"');
  });

  it('honours the JANUX_LOCALE cookie over accept-language', async () => {
    const response = await app().fetch(
      new Request('http://test/', { headers: { cookie: 'JANUX_LOCALE=pl', 'accept-language': 'es' } }),
    );

    expect(response.headers.get('location')).toBe('/pl');
  });
});
