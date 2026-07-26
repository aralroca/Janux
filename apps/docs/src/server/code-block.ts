import type { ShikiTransformer } from 'shiki';

/**
 * The chrome around a highlighted snippet, driven by the fence's own meta:
 *
 * ```tsx title="src/pages/index.tsx" {1,3-5} live
 * ```
 *
 * `title=` is shiki's own convention (and rehype-pretty-code's), so a snippet
 * that names its file reads the same here as in the editor. `live` predates the
 * rest and keeps working in any position.
 */
const TITLE = /title="([^"]+)"/;
const RANGES = /\{([\d,\s-]+)\}/;
const LIVE = /\blive\b/;
/** Only where uppercasing the fence's own language would read wrong. */
const LANG_LABELS: Record<string, string> = { typescript: 'TS', javascript: 'JS', jsonc: 'JSON', dockerfile: 'Docker', bash: 'Shell', text: '' };
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export interface Fence {
  language: string;
  title?: string;
  live: boolean;
  highlighted: Set<number>;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ESCAPES[char]!);
}

/** `3` → [3]; `3-5` → [3, 4, 5]. A malformed part expands to nothing. */
function expandRange(part: string): number[] {
  const [start, end = start] = part.split('-').map(Number);

  return Array.from({ length: end! - start! + 1 }, (_, offset) => start! + offset);
}

export function parseFence(info = ''): Fence {
  const [language = 'text', ...rest] = info.split(/\s+/);
  const meta = rest.join(' ');
  // Everything but the title, so a path containing `live` or braces is inert.
  const flags = meta.replace(TITLE, '');
  const ranges = RANGES.exec(flags)?.[1]?.split(',').filter(Boolean) ?? [];

  return {
    language,
    title: TITLE.exec(meta)?.[1],
    live: LIVE.test(flags),
    highlighted: new Set(ranges.flatMap(expandRange)),
  };
}

/** Marks the requested lines so the stylesheet can carry the accent bar. */
export function lineTransformers({ highlighted }: Fence): ShikiTransformer[] | undefined {
  if (highlighted.size === 0) return undefined;

  return [
    {
      line(node, line) {
        if (highlighted.has(line)) this.addClassToHast(node, 'highlighted');
      },
    },
  ];
}

/**
 * One copy button everywhere: the same markup the install pill on the home
 * already uses, so the icon, the states and the delegated listener in
 * copy-code.ts are shared rather than mirrored.
 */
const COPY_BUTTON = `<button class="copy-code" type="button" aria-label="Copy code"><svg class="ic-copy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><svg class="ic-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>`;

function actions(playgroundHref?: string): string {
  const tryIt = playgroundHref ? `<a class="try-it" href="${playgroundHref}">▶ Run in playground</a>` : '';

  return `<div class="block-actions">${tryIt}${COPY_BUTTON}</div>`;
}

function head({ language, title }: Fence, chrome: string): string {
  const label = LANG_LABELS[language] ?? language.toUpperCase();
  const badge = label ? `<span class="code-lang">${label}</span>` : '';

  return `<div class="code-head">${badge}<span class="code-file">${escapeHtml(title!)}</span>${chrome}</div>`;
}

/**
 * Titled blocks are a card: the header carries the actions, so the button sits
 * in the same corner whether or not there is a file name — the absolute overlay
 * only has the block to itself when there is no header.
 */
export function codeBlock(fence: Fence, code: string, playgroundHref?: string): string {
  const chrome = actions(playgroundHref);

  if (!fence.title) return `<div class="code-block">${code}${chrome}</div>`;

  return `<div class="code-block titled">${head(fence, chrome)}${code}</div>`;
}
