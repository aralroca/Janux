import type { I18nConfig } from 'janux';
import en from './messages/en';
import es from './messages/es';
import fr from './messages/fr';

/** The default-locale messages type: parameterizes `getI18n<Messages>(ctx)` for type-safe keys. */
export type Messages = typeof en;

export default {
  locales: ['en', 'es', 'fr'],
  defaultLocale: 'en',
  messages: { en, es, fr },
} satisfies I18nConfig<Messages>;
