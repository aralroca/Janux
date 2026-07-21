import { transform } from 'sucrase';
import {
  buildManifest,
  createInstance,
  watch,
  toDomNodes,
  morph,
  type ComponentDef,
  type JanuxInstance,
  type Proposal,
} from './pg-runtime';

const root = document.getElementById('root')!;
const proposals = new Map<string, Proposal>();

let generation = 0;
let current: JanuxInstance | undefined;
let currentDef: ComponentDef | undefined;
let stopRender: (() => void) | undefined;

function post(message: Record<string, unknown>): void {
  parent.postMessage(message, '*');
}

function compile(code: string): string {
  return transform(code, {
    transforms: ['typescript', 'jsx'],
    jsxRuntime: 'automatic',
    jsxImportSource: 'janux',
  }).code;
}

async function loadDefs(code: string): Promise<ComponentDef[]> {
  const blob = new Blob([compile(code)], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const mod = await import(/* @vite-ignore */ url).finally(() => URL.revokeObjectURL(url));

  return Object.values(mod).filter(
    (value: any): value is ComponentDef => value?.kind === 'component' || value?.kind === 'store',
  );
}

async function report(): Promise<void> {
  if (!current || !currentDef) return;
  await current.settled();
  post({
    type: 'state',
    manifest: buildManifest([{ def: currentDef, instance: current }]),
    resource: current.resource(),
  });
}

async function invokeIntent(name: string, input: unknown, origin: 'human' | 'agent'): Promise<unknown> {
  const invoke = current?.intents[name];

  if (!invoke) throw new Error(`Unknown intent "${name}"`);
  const result: any = await invoke(input, { origin });

  if (result?.status === 'proposal') post({ type: 'proposal', proposal: { id: result.id, tool: result.tool, input: result.input } });
  await report();

  return result;
}

function elementInput(el: Element): unknown {
  const raw = el.getAttribute('data-input');

  return raw ? JSON.parse(raw) : undefined;
}

function delegate(): void {
  root.addEventListener('click', (event) => {
    const el = (event.target as Element).closest('[data-jxa]');

    if (!el) return;
    const intentName = el.getAttribute('data-jxa')!.split(':')[1]!;

    invokeIntent(intentName, elementInput(el), 'human').catch(reportError);
  });
  root.addEventListener('submit', (event) => {
    const el = (event.target as Element).closest('[data-jxform]');

    if (!el) return;
    event.preventDefault();
    const intentName = el.getAttribute('data-jxform')!.split(':')[1]!;
    const input = Object.fromEntries(new FormData(event.target as HTMLFormElement).entries());

    invokeIntent(intentName, input, 'human').catch(reportError);
  });
}

function reportError(error: unknown): void {
  post({ type: 'error', message: String(error) });
}

async function run(code: string): Promise<void> {
  const myGeneration = (generation += 1);

  stopRender?.();
  stopRender = undefined;
  await current?.dispose();
  current = undefined;
  root.innerHTML = '';
  proposals.clear();
  const defs = await loadDefs(code);

  if (myGeneration !== generation) return;
  const def = defs.find((candidate) => candidate.kind === 'component' && candidate.view);

  if (!def) throw new Error('Export at least one component({ ... }) with a view');
  currentDef = def;
  current = createInstance(def, { onProposal: (proposal) => proposals.set(proposal.id, proposal) });
  stopRender = watch(() => {
    morph(root as any, toDomNodes(def.view!(current!.bag)) as any);
  });
  await current.attach();
  post({ type: 'ready' });
  await report();
}

async function handleMessage(data: any): Promise<void> {
  if (data?.type === 'run') await run(data.code);
  if (data?.type === 'call') {
    const result = await invokeIntent(data.tool.split('.')[1], data.input, 'agent').catch((error) => ({
      error: String(error),
    }));

    post({ type: 'call-result', id: data.id, result });
  }
  if (data?.type === 'approve') {
    const proposal = proposals.get(data.id);

    if (proposal) {
      proposals.delete(data.id);
      await proposal.execute();
      await report();
    }
  }
}

window.addEventListener('message', (event) => {
  handleMessage(event.data).catch(reportError);
});
delegate();
post({ type: 'frame-ready' });
