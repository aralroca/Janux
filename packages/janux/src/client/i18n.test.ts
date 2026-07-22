import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { I18n } from '../i18n/types';
import { installI18n } from './i18n';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function embed(payload: unknown): void {
  document.body.innerHTML = `<script type="application/janux+i18n" id="jx-i18n">${JSON.stringify(payload)}</script>`;
}

const payload = {
  locale: 'es',
  locales: ['en', 'es'],
  defaultLocale: 'en',
  messages: { counter: { label_one: '{{count}} clic', label_other: '{{count}} clics' } },
};

describe('installI18n', () => {
  it('builds ctx.i18n from the embedded payload', () => {
    const ctx: Record<string, unknown> = {};

    embed(payload);
    installI18n(ctx);
    const i18n = ctx.i18n as I18n;

    expect(i18n.locale).toBe('es');
    expect(i18n.t<string>('counter.label', { count: 2 })).toBe('2 clics');
  });

  it('replaces ctx.i18n in place after a locale-switch navigation', () => {
    const ctx: Record<string, unknown> = {};

    embed(payload);
    installI18n(ctx);
    embed({ ...payload, locale: 'en', messages: { counter: { label_one: '{{count}} click', label_other: '{{count}} clicks' } } });
    installI18n(ctx);

    expect((ctx.i18n as I18n).t<string>('counter.label', { count: 2 })).toBe('2 clicks');
  });

  it('leaves ctx untouched when the page embeds no payload', () => {
    const ctx: Record<string, unknown> = { i18n: 'previous' };

    document.body.innerHTML = '<main></main>';
    installI18n(ctx);

    expect(ctx.i18n).toBe('previous');
  });
});
