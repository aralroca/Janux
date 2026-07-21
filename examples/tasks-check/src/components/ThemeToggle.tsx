import { component, intent } from 'janux';
import { theme } from '../stores';

/** Second island sharing the theme store — cross-island state, no props. */
export const ThemeToggle = component({
  name: 'theme-toggle',
  description: 'Switches the shared theme between dark and light.',

  use: { theme },

  intents: {
    toggle: intent({
      description: 'Toggle dark/light mode',
      run: ({ use }: any) => use.theme.intents.toggle({}),
    }),
  },

  view: ({ use, intents }: any) => (
    <button class="theme-toggle" on={intents.toggle}>
      {use.theme.state.mode === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  ),
});
