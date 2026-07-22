import { getI18n, type Ctx } from 'janux';
import { Header } from '../components/Header';
import type { Messages } from '../i18n';

export const meta = ({ ctx }: { ctx: Ctx }) => ({ title: getI18n(ctx).t<string>('about.title') });

export default function About({ ctx }: { ctx: Ctx }) {
  const { t } = getI18n<Messages>(ctx);

  return (
    <main>
      <Header ctx={ctx} path="/about" />
      <h1>{t('about.title')}</h1>
      <p>{t('about.body')}</p>
      <p>
        <a href="/">{t('about.back')}</a>
      </p>
    </main>
  );
}
