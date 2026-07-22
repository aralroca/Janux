import { component } from 'janux';

let teardown: (() => void) | undefined;

/**
 * ⌘K search. Same shape as PlaygroundShell: a stateless, eager island whose
 * static skeleton never re-renders; `attach` lazy-loads the imperative wiring
 * (keystrokes are presentational noise, not intents — agents use `searchDocs`).
 */
export const SearchModal = component({
  name: 'search',
  description: 'Full-text search over the documentation (open with ⌘K).',

  lifecycle: {
    attach: async () => {
      const { mountSearch } = await import('../search/mount-search');

      teardown = mountSearch();
    },
    detach: () => {
      teardown?.();
      teardown = undefined;
    },
  },

  view: () => (
    <div class="search">
      <button id="search-open" type="button" class="search-btn">
        <span class="search-btn-label">Search docs…</span>
        <kbd>⌘K</kbd>
      </button>
      <dialog id="search-dialog" class="search-dialog" aria-label="Search documentation">
        <input
          id="search-input"
          type="search"
          placeholder="Search docs…"
          autocomplete="off"
          spellcheck="false"
        />
        <ul id="search-results" role="listbox"></ul>
      </dialog>
    </div>
  ),
});
