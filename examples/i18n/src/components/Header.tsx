import { getI18n, type Ctx } from 'janux';
import type { Messages } from '../i18n';

const LOCALE_NAMES: Record<string, string> = { en: 'English', es: 'Español', fr: 'Français' };

/** The switcher links carry their own locale prefix, so the server leaves them untouched. */
export function Header({ ctx, path }: { ctx: Ctx; path: string }) {
  const { t, locale, locales } = getI18n<Messages>(ctx);

  return (
    <header>
      <a class="brand" href="/">
        Janux i18n
      </a>
      <nav aria-label={t('switcher.label')}>
        {locales.map((code) => (
          <a key={code} href={`/${code}${path === '/' ? '' : path}`} class={code === locale ? 'active' : ''}>
            {LOCALE_NAMES[code] ?? code}
          </a>
        ))}
      </nav>
    </header>
  );
}
