import { component, intent, schema, enums } from 'janux';

const MODES = ['system', 'light', 'dark'] as const;

function applyTheme(mode: string): void {
  if (mode === 'system') delete document.body.dataset.theme;
  else document.body.dataset.theme = mode;

  localStorage.setItem('janux-theme', mode);
}

/**
 * Cycles system → light → dark. The DOM (`body[data-theme]` — body because
 * diff-dom-streaming preserves body attributes across SPA diffs) is the source
 * of truth — the inline script in Layout restores it before first paint — and
 * CSS picks the visible icon from it, so the server HTML never mismatches.
 */
export const ThemeToggle = component({
  name: 'theme',
  description: 'Color theme of the docs site.',

  state: schema({ mode: enums(['system', 'light', 'dark']) }),

  intents: {
    cycle: intent({
      description: 'Switch to the next color theme (system → light → dark). Returns the theme it landed on.',
      // An agent asked for "dark" cannot see the DOM: without the resulting mode
      // it calls this once and reports success from the wrong theme.
      run: ({ state }: any) => {
        const current = document.body.dataset.theme ?? 'system';
        const next = MODES[(MODES.indexOf(current as (typeof MODES)[number]) + 1) % MODES.length];

        state.mode = next;
        applyTheme(next);

        return { theme: next };
      },
    }),
  },

  view: ({ intents }: any) => (
    <button class="theme-toggle" type="button" onClick={intents.cycle} aria-label="Toggle color theme">
      <span class="theme-icon icon-system">◐</span>
      <span class="theme-icon icon-light">☀</span>
      <span class="theme-icon icon-dark">☾</span>
    </button>
  ),
});
