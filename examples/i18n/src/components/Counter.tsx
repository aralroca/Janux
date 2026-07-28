import { component, getI18n, int, intent, schema } from 'janux';
import type { Messages } from '../i18n';

export const Counter = component({
  name: 'counter',
  description: 'A counter that translates and pluralizes its label on every interaction.',
  state: schema({ count: int() }),
  // Rendered only after the fifth click, so SSR never records it: declare it to ship it.
  i18nKeys: ['counter.milestone'],
  intents: {
    add: intent({ description: 'Increment the counter', run: ({ state }) => (state.count += 1) }),
  },
  view: ({ state, intents, ctx }: any) => {
    const { t } = getI18n<Messages>(ctx);

    return (
      <div class="counter">
        <output>{t('counter.label', { count: state.count })}</output>
        {state.count >= 5 && <p class="milestone">{t('counter.milestone')}</p>}
        <button onClick={intents.add}>{t('counter.add')}</button>
      </div>
    );
  },
});
