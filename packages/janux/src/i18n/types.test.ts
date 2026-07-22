import { describe, expect, it } from 'bun:test';
import { translateCore } from './translate-core';
import { getI18n } from './context';

const en = {
  hello: 'Hello {{name}}',
  cart_one: 'One item',
  cart_other: '{{count}} items',
  nested: { deep: 'Deep' },
};

describe('i18n type-safe keys', () => {
  it('accepts known keys (plural-collapsed, nested) and rejects unknown ones at compile time', () => {
    const config = { locales: ['en'], defaultLocale: 'en', messages: { en } };
    const i18n = { locale: 'en', defaultLocale: 'en', locales: ['en'], t: translateCore('en', config) };
    const { t, locale } = getI18n<typeof en>({ i18n });

    expect(locale).toBe('en');
    expect(t<string>('hello', { name: 'x' })).toBe('Hello x');
    expect(t<string>('cart', { count: 2 })).toBe('2 items');
    expect(t<string>('nested.deep')).toBe('Deep');
    // @ts-expect-error unknown keys fail to compile
    t('nope');
    // @ts-expect-error plural variants are not addressable directly
    t('cart_one');
    expect(t<Record<string, unknown>>('nested', null, { returnObjects: true })).toEqual({ deep: 'Deep' });
  });

  it('throws a clear error when i18n is not configured', () => {
    const access = (): unknown => getI18n({});

    expect(access).toThrow('i18n is not configured');
  });
});
