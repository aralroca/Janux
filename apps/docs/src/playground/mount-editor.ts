import { EXAMPLES } from './examples';
import { createEditor } from './monaco-setup';
import { createFrame, decodeShare, encodeShare, type FrameHost } from './frame-host';
import { renderAgentPanel, renderProposal } from './agent-panel';

interface Els {
  editor: HTMLElement;
  preview: HTMLElement;
  agent: HTMLElement;
  error: HTMLElement;
  example: HTMLSelectElement;
  share: HTMLButtonElement;
}

function grabEls(): Els {
  return {
    editor: document.getElementById('pg-editor')!,
    preview: document.getElementById('pg-preview')!,
    agent: document.getElementById('pg-agent')!,
    error: document.getElementById('pg-error')!,
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

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;

  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Wires the whole playground: Monaco, sandboxed frame, agent panel, share links. */
export async function mountPlayground(): Promise<void> {
  const els = grabEls();
  const initial = decodeShare(location.hash) ?? EXAMPLES.Counter!;
  const editor = await createEditor(els.editor, initial);

  fillExamples(els.example);

  let frame: FrameHost;
  let pendingProposal: any;
  const run = (): void => {
    els.error.hidden = true;
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
  const showProposal = (): void => {
    if (pendingProposal) renderProposal(els.agent, pendingProposal, approve);
  };
  const onFrameMessage = (data: any): void => {
    if (data?.type === 'frame-ready') run();
    if (data?.type === 'state') {
      renderAgentPanel(els.agent, data.manifest, data.resource, callTool);
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
  });
  els.share.addEventListener('click', () => {
    location.hash = `c=${encodeShare(editor.getValue())}`;
    navigator.clipboard?.writeText(location.href).catch(() => {});
    els.share.textContent = 'Copied!';
    setTimeout(() => (els.share.textContent = 'Share'), 1500);
  });
}

function showError(el: HTMLElement, message: string): void {
  el.hidden = false;
  el.textContent = message;
}
