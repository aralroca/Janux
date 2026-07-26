import { EXAMPLES } from './examples';
import { createEditor } from './monaco-setup';
import { createFrame, decodeShare, encodeShare, type FrameHost } from './frame-host';
import { renderAgentPanel, renderProposal } from './agent-panel';

interface Els {
  editor: HTMLElement;
  preview: HTMLElement;
  agent: HTMLElement;
  error: HTMLElement;
  loading: HTMLElement;
  example: HTMLSelectElement;
  share: HTMLButtonElement;
}

function grabEls(): Els {
  return {
    editor: document.getElementById('pg-editor')!,
    preview: document.getElementById('pg-preview')!,
    agent: document.getElementById('pg-agent')!,
    error: document.getElementById('pg-error')!,
    loading: document.getElementById('pg-loading')!,
    example: document.getElementById('pg-example') as HTMLSelectElement,
    share: document.getElementById('pg-share') as HTMLButtonElement,
  };
}

function fillExamples(select: HTMLSelectElement): void {
  Object.keys(EXAMPLES).forEach((name) => {
    const option = document.createElement('option');

    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

const EXPAND_CLASSES = ['expand-editor', 'expand-preview'] as const;

/** ⛶ buttons: expand one pane to full width (click again to restore). */
function wireExpand(): void {
  const root = document.getElementById('pg-root')!;
  const buttons = EXPAND_CLASSES.map((name) => document.getElementById(`pg-${name}`)!);

  buttons.forEach((button, index) =>
    button.addEventListener('click', () => {
      const on = !root.classList.contains(EXPAND_CLASSES[index]!);

      root.classList.remove(...EXPAND_CLASSES);
      if (on) root.classList.add(EXPAND_CLASSES[index]!);
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(on && index === j)));
    }),
  );
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;

  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/**
 * Monaco is a third-party editor loaded at runtime, and it does fail: bundled
 * for production, its language contributions reach the API before it is built
 * (`languages.register is not a function`). A failure has to stop here, in the
 * pane that owns it — an island that throws while mounting used to take the
 * whole page down with it, and the page it took down was this one.
 */
/**
 * Monaco measures text to lay itself out, so it has to be measured *after* the
 * font it will measure with has loaded and while the pane already has its size —
 * otherwise the first frame is the one that shipped: lines clipped mid-token,
 * scrolled sideways, snapping into place a moment later. The cover comes off
 * once, after that layout.
 */
async function reveal(editor: any): Promise<void> {
  await document.fonts?.ready;
  editor.layout();
  editor.setScrollPosition({ scrollLeft: 0, scrollTop: 0 });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  document.getElementById('pg-editor-cover')?.remove();
}

async function openEditor(host: HTMLElement, initial: string, error: HTMLElement): Promise<any> {
  try {
    const editor = await createEditor(host, initial);

    await reveal(editor);

    return editor;
  } catch (cause) {
    showError(error, `The editor failed to load: ${cause}`);
    document.getElementById('pg-editor-cover')?.remove();

    return undefined;
  }
}

/** Wires the whole playground: Monaco, sandboxed frame, agent panel, share links. Returns a teardown. */
export async function mountPlayground(): Promise<() => void> {
  const els = grabEls();
  const initial = decodeShare(location.hash) ?? EXAMPLES.Counter!;
  const editor = await openEditor(els.editor, initial, els.error);

  if (!editor) return () => {};

  fillExamples(els.example);
  wireExpand();

  let frame: FrameHost;
  let pendingProposal: any;
  let glowEnabled = true;
  const run = (): void => {
    els.error.hidden = true;
    els.loading.classList.add('on');
    pendingProposal = undefined;
    frame.send({ type: 'run', code: editor.getValue() });
  };
  const callTool = (tool: string, input: unknown): void => {
    frame.send({ type: 'call', tool, input, id: `${Date.now()}` });
  };
  const approve = (id: string): void => {
    pendingProposal = undefined;
    frame.send({ type: 'approve', id });
  };
  const reject = (id: string): void => {
    pendingProposal = undefined;
    frame.send({ type: 'reject', id });
  };
  const showProposal = (): void => {
    if (pendingProposal) renderProposal(els.agent, pendingProposal, approve, reject);
  };
  const toggleGlow = (enabled: boolean): void => {
    glowEnabled = enabled;
    frame.send({ type: 'glow', enabled });
  };
  const onFrameMessage = (data: any): void => {
    if (data?.type === 'ready' || data?.type === 'error') els.loading.classList.remove('on');
    if (data?.type === 'frame-ready') run();
    if (data?.type === 'state') {
      renderAgentPanel(els.agent, data.manifest, data.resource, callTool, {
        enabled: glowEnabled,
        onToggle: toggleGlow,
      });
      showProposal();
    }
    if (data?.type === 'proposal') {
      pendingProposal = data.proposal;
      showProposal();
    }
    if (data?.type === 'error') showError(els.error, data.message);
  };

  frame = createFrame(els.preview, onFrameMessage);
  editor.onDidChangeModelContent(debounce(run, 600));
  els.example.addEventListener('change', () => {
    editor.setValue(EXAMPLES[els.example.value] ?? '');
    run();
  });
  els.share.addEventListener('click', () => {
    location.hash = `c=${encodeShare(editor.getValue())}`;
    navigator.clipboard?.writeText(location.href).catch(() => {});
    els.share.textContent = 'Copied!';
    setTimeout(() => (els.share.textContent = 'Share'), 1500);
  });

  return () => {
    frame.dispose();
    editor.getModel()?.dispose();
    editor.dispose();
  };
}

function showError(el: HTMLElement, message: string): void {
  el.hidden = false;
  el.textContent = message;
}
