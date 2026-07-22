import { searchPages, type SearchHit, type SearchPage } from './score';

interface Refs {
  dialog: HTMLDialogElement;
  input: HTMLInputElement;
  results: HTMLElement;
}

let corpus: Promise<SearchPage[]> | undefined;

function loadCorpus(): Promise<SearchPage[]> {
  corpus ??= fetch('/search-index.json').then((response) => response.json());

  return corpus;
}

function hitHref(hit: SearchHit): string {
  return `/docs/${hit.section}/${hit.slug}${hit.heading ? `#${hit.heading.id}` : ''}`;
}

function hitItem(hit: SearchHit): HTMLLIElement {
  const item = document.createElement('li');
  const link = document.createElement('a');
  const title = document.createElement('strong');
  const snippet = document.createElement('span');

  link.href = hitHref(hit);
  title.textContent = hit.heading ? `${hit.title} › ${hit.heading.text}` : hit.title;
  snippet.textContent = hit.snippet;
  link.append(title, snippet);
  item.append(link);

  return item;
}

function setActive(refs: Refs, index: number): void {
  const items = [...refs.results.children];

  items.forEach((item, i) => item.classList.toggle('active', i === index));
  items[index]?.scrollIntoView({ block: 'nearest' });
}

async function renderResults(refs: Refs, cursor: { active: number }): Promise<void> {
  const hits = searchPages(await loadCorpus(), refs.input.value);

  refs.results.replaceChildren(...hits.map(hitItem));
  cursor.active = 0;
  setActive(refs, 0);
}

function openDialog(refs: Refs): void {
  refs.dialog.showModal();
  refs.input.select();
}

function moveActive(refs: Refs, cursor: { active: number }, delta: number): void {
  const count = refs.results.children.length;

  if (count === 0) return;
  cursor.active = (cursor.active + delta + count) % count;
  setActive(refs, cursor.active);
}

function openActive(refs: Refs, cursor: { active: number }): void {
  refs.results.children[cursor.active]?.querySelector('a')?.click();
  refs.dialog.close();
}

function onInputKey(refs: Refs, cursor: { active: number }, event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(refs, cursor, event.key === 'ArrowDown' ? 1 : -1);
  }
  if (event.key === 'Enter') openActive(refs, cursor);
  if (event.key === 'Escape') {
    // type="search" swallows the first Esc to clear itself — close right away.
    event.preventDefault();
    refs.dialog.close();
  }
}

function onGlobalKey(refs: Refs, event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
  event.preventDefault();
  if (refs.dialog.open) refs.dialog.close();
  else openDialog(refs);
}

/** Wires the ⌘K dialog; returns a disposer (one AbortController for every listener). */
export function mountSearch(): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const refs: Refs = {
    dialog: document.getElementById('search-dialog') as HTMLDialogElement,
    input: document.getElementById('search-input') as HTMLInputElement,
    results: document.getElementById('search-results') as HTMLElement,
  };
  const cursor = { active: 0 };

  document.getElementById('search-open')?.addEventListener('click', () => openDialog(refs), { signal });
  document.addEventListener('keydown', (event) => onGlobalKey(refs, event), { signal });
  refs.input.addEventListener('input', () => renderResults(refs, cursor).catch(console.error), { signal });
  refs.input.addEventListener('keydown', (event) => onInputKey(refs, cursor, event), { signal });
  refs.results.addEventListener('click', () => refs.dialog.close(), { signal });
  refs.dialog.addEventListener('click', (event) => {
    if (event.target === refs.dialog) refs.dialog.close();
  }, { signal });

  return () => controller.abort();
}
