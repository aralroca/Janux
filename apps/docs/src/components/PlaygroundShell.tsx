import { component } from 'janux';

let teardown: (() => void) | undefined;

/**
 * Thin island hosting the playground. Deliberately stateless: the view is a
 * static skeleton that never re-renders (a re-render would morph away the
 * imperative Monaco/agent-panel DOM). `attach` lazy-loads the heavy editor
 * code — Monaco and sucrase never touch any other page. `detach` tears Monaco
 * down so revisiting via SPA navigation doesn't collide with a stale model.
 */
export const PlaygroundShell = component({
  name: 'playground',
  description: 'Interactive Janux playground: edit a component, see both faces live.',

  lifecycle: {
    attach: async () => {
      const { mountPlayground } = await import('../playground/mount-editor');

      teardown = await mountPlayground();
    },
    detach: () => {
      teardown?.();
      teardown = undefined;
    },
  },

  view: () => (
    <div>
      <div class="playground-bar">
        <h1>⚡ Playground</h1>
        <select id="pg-example" aria-label="Load example"></select>
        <button id="pg-share" type="button">
          Share
        </button>
        <span class="pg-hint">Edits run automatically · the right panel is what an agent sees</span>
      </div>
      <div class="playground" id="pg-root">
        <div class="editor-pane">
          <div class="pane-head">
            <span class="pane-tab">playground.tsx</span>
            <button id="pg-expand-editor" class="pane-expand" type="button" aria-label="Expand editor" aria-pressed="false">
              ⛶
            </button>
          </div>
          <div class="editor-host" id="pg-editor"></div>
        </div>
        <div class="preview-pane">
          <div class="pane-head browser-chrome">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
            <span class="addr">preview</span>
            <button id="pg-expand-preview" class="pane-expand" type="button" aria-label="Expand preview" aria-pressed="false">
              ⛶
            </button>
          </div>
          <div class="preview-host" id="pg-preview">
            <div class="pg-loading" id="pg-loading">
              <span class="pg-spinner"></span> Running…
            </div>
          </div>
        </div>
        <div class="agent-pane" id="pg-agent"></div>
      </div>
      <div class="error-overlay" id="pg-error" hidden></div>
    </div>
  ),
});
