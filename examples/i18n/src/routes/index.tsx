import { getI18n, type Ctx } from 'janux';
import { Counter } from '../components/Counter';
import { Header } from '../components/Header';
import type { Messages } from '../i18n';

export const meta = ({ ctx }: { ctx: Ctx }) => ({ title: getI18n(ctx).t<string>('home.title') });

export default function Home({ ctx }: { ctx: Ctx }) {
  const { t, locale } = getI18n<Messages>(ctx);

  return (
    <main>
      <Header ctx={ctx} path="/" />
      <h1>{t('home.title')}</h1>
      <p>{t('home.lead', { locale })}</p>
      {/* key={locale}: a locale switch re-creates the island instead of reusing the mounted instance. */}
      <Counter key={locale} />
      <p>
        <a href="/about">{t('home.about')}</a>
      </p>
    </main>
  );
}
