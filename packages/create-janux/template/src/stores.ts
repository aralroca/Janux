import { store, intent, schema, enums } from 'janux';

/** Shared theme, projected to agents as store://theme. */
export const theme = store({
  name: 'theme',
  description: 'UI theme shared by every island.',
  state: schema({ mode: enums(['dark', 'light']).default('dark') }),
  intents: {
    toggle: intent({
      description: 'Switch between dark and light mode',
      run: ({ state }) => {
        state.mode = state.mode === 'dark' ? 'light' : 'dark';
        if (typeof document !== 'undefined') document.documentElement.dataset.theme = state.mode;
      },
    }),
  },
});
