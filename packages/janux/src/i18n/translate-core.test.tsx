import { describe, expect, it } from 'bun:test';
import { translateCore } from './translate-core';
import { renderToString } from '../render/server';
import type { I18nConfig } from './types';

function config(messages: Record<string, unknown>, extra: Partial<I18nConfig> = {}): I18nConfig {
  return { locales: ['en', 'es'], defaultLocale: 'en', messages: { en: messages }, ...extra } as I18nConfig;
}

describe('translateCore', () => {
  it('interpolates {{variables}}', () => {
    const t = translateCore('en', config({ hello_world: 'Hello {{name}}' }));

    expect(t<string>('hello_world', { name: 'Test' })).toBe('Hello Test');
  });

  it('resolves nested keys with the separator', () => {
    const t = translateCore('en', config({ hello: { nested: 'Hello {{name}}' } }));

    expect(t<string>('hello.nested', { name: 'Test' })).toBe('Hello Test');
  });

  it('returns the key itself when there is no translation', () => {
    const t = translateCore('en', config({}));

    expect(t<string>('missing.key')).toBe('missing.key');
  });

  it('returns objects with returnObjects, interpolated', () => {
    const messages = { group: { one: 'msg {{count}}', two: 'other' } };
    const t = translateCore('en', config(messages));

    expect(t<Record<string, unknown>>('group', { count: 9 }, { returnObjects: true })).toEqual({ one: 'msg 9', two: 'other' });
    expect(t<Record<string, unknown>>('.', null, { returnObjects: true })).toEqual({ group: { one: 'msg {{count}}', two: 'other' } });
  });

  it('does not mutate the config messages when interpolating objects', () => {
    const messages = { group: { one: 'msg {{count}}' } };
    const t = translateCore('en', config(messages));

    t('group', { count: 9 }, { returnObjects: true });
    expect(messages.group.one).toBe('msg {{count}}');
  });

  it('selects plural variants from query.count', () => {
    const t = translateCore('en', config({ cart_one: 'One item', cart_other: '{{count}} items', cart_0: 'Empty' }));

    expect(t<string>('cart', { count: 1 })).toBe('One item');
    expect(t<string>('cart', { count: 5 })).toBe('5 items');
    expect(t<string>('cart', { count: 0 })).toBe('Empty');
  });

  it('selects nested plural variants (key.one / key.other)', () => {
    const t = translateCore('en', config({ cart: { one: 'One item', other: '{{count}} items' } }));

    expect(t<string>('cart', { count: 1 })).toBe('One item');
    expect(t<string>('cart', { count: 3 })).toBe('3 items');
  });

  it('honors allowEmptyStrings (default true)', () => {
    expect(translateCore('en', config({ empty: '' }))<string>('empty')).toBe('');
    expect(translateCore('en', config({ empty: '' }, { allowEmptyStrings: false }))<string>('empty')).toBe('empty');
  });

  it('walks the fallback chain before giving up', () => {
    const t = translateCore('en', config({ real: 'Found {{name}}' }));

    expect(t<string>('missing', { name: 'x' }, { fallback: ['also-missing', 'real'] })).toBe('Found x');
    // Exhausted fallbacks return the last key tried (Brisa parity).
    expect(t<string>('missing', null, { fallback: 'also-missing' })).toBe('also-missing');
  });

  it('uses the default option when the key and fallbacks are missing', () => {
    const t = translateCore('en', config({}));

    expect(t<string>('missing', { name: 'x' }, { default: 'Hi {{name}}' })).toBe('Hi x');
    expect(t<unknown>('missing', null, { default: undefined })).toBeUndefined();
  });

  it('supports custom interpolation prefix/suffix', () => {
    const t = translateCore('en', config({ key: 'hello [[name]]' }, { interpolation: { prefix: '[[', suffix: ']]' } }));

    expect(t<string>('key', { name: 'test' })).toBe('hello test');
  });

  it('supports interpolation formatters', () => {
    const format = (value: unknown, name: string) => (name === 'uppercase' ? String(value).toUpperCase() : String(value));
    const t = translateCore('en', config({ key: 'hello {{name, uppercase}}' }, { interpolation: { format } }));

    expect(t<string>('key', { name: 'test' })).toBe('hello TEST');
  });

  it('supports custom keySeparator', () => {
    const t = translateCore('en', config({ a: { b: 'deep' } }, { keySeparator: ':' }));

    expect(t<string>('a:b')).toBe('deep');
  });

  it('renders JSX elements from <0> markers', async () => {
    const t = translateCore('en', config({ key: 'hello <0>{{name}}</0>' }));
    const output = t<unknown>('key', { name: 'test' }, { elements: [<strong />] });

    expect((await renderToString(output)).html).toBe('hello <strong>test</strong>');
  });

  it('renders JSX elements from named markers', async () => {
    const t = translateCore('en', config({ key: 'hello <bold>{{name}}</bold>' }));
    const output = t<unknown>('key', { name: 'test' }, { elements: { bold: <strong class="x" /> } });

    expect((await renderToString(output)).html).toBe('hello <strong class="x">test</strong>');
  });

  it('drops unmatched markers but keeps their content', async () => {
    const t = translateCore('en', config({ key: 'hello <9>world</9>' }));

    expect((await renderToString(t<unknown>('key', null, { elements: [] }))).html).toBe('hello world');
  });
});
