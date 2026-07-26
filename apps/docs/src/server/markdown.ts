import { Marked } from 'marked';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { codeBlock, lineTransformers, parseFence } from './code-block';
import { CONTRAST_FIXES } from '../theme-contrast';

/**
 * Shiki, bundled by hand ("fine-grained", in its docs) rather than by name.
 *
 * `createHighlighter('typescript')` loads grammars through lazy imports and the
 * Oniguruma WASM, which is fine while the app runs from `node_modules` and
 * silently catastrophic once it is bundled for a serverless function: the
 * imports resolve to nothing, the highlighter reports no languages, and every
 * snippet on the site renders as plain text. Naming the grammars here means the
 * bundler can see them, and the JS regex engine means there is no WASM to fetch.
 */
const THEMES = { light: 'github-light', dark: 'github-dark' } as const;
const LANGS = [
  import('@shikijs/langs/typescript'),
  import('@shikijs/langs/tsx'),
  import('@shikijs/langs/bash'),
  import('@shikijs/langs/json'),
  import('@shikijs/langs/jsonc'),
  import('@shikijs/langs/css'),
  import('@shikijs/langs/html'),
];


let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
    langs: LANGS,
    engine: createJavaScriptRegexEngine(),
  });

  return highlighterPromise;
}

export interface TocEntry {
  depth: number;
  id: string;
  text: string;
}

export interface RenderedDoc {
  html: string;
  toc: TocEntry[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function base64url(text: string): string {
  return Buffer.from(text).toString('base64url');
}

function codeRenderer(highlighter: HighlighterCore) {
  return ({ text, lang }: { text: string; lang?: string }): string => {
    const fence = parseFence(lang);
    const known = highlighter.getLoadedLanguages().includes(fence.language) ? fence.language : 'text';
    // light-dark() colors follow the page's `color-scheme`, so code blocks flip
    // with the theme toggle without any extra CSS plumbing.
    const highlighted = highlighter.codeToHtml(text, {
      lang: known,
      themes: THEMES,
      colorReplacements: CONTRAST_FIXES,
      defaultColor: 'light-dark()',
      transformers: lineTransformers(fence),
    });

    return codeBlock(fence, highlighted, fence.live ? `/playground#c=${base64url(text)}` : undefined);
  };
}

function calloutRenderer() {
  return function blockquote(this: any, { tokens }: any): string {
    const body = this.parser.parse(tokens);
    const kind = /^<p><strong>(Note|Tip|Warning)/.exec(body)?.[1]?.toLowerCase();

    return kind ? `<aside class="callout ${kind}">${body}</aside>` : `<blockquote>${body}</blockquote>`;
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** parseInline emits HTML — strip tags and decode entities for TOC/anchor text. */
function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ENTITIES[entity]!);
}

function headingRenderer(toc: TocEntry[]) {
  return function heading(this: any, { tokens, depth }: any): string {
    const text = this.parser.parseInline(tokens);
    const plain = plainText(text);
    const id = slugify(plain);

    if (depth === 2 || depth === 3) toc.push({ depth, id, text: plain });

    return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to ${plain}">#</a></h${depth}>`;
  };
}

const DESCRIPTION_LIMIT = 155;
/**
 * Headings, quotes, fences, tables, lists and raw HTML — everything that isn't a
 * sentence. The list markers need the trailing space: without it a paragraph
 * opening in bold (`**Bifacial component** — …`, the glossary) reads as a list
 * item, and that page ends up with no description at all.
 */
const NOT_PROSE = /^(#|>|```|\||[-*+]\s|\d+\.\s|<)/;

/**
 * Markdown → prose: fences dropped, inline code and link text kept, heading
 * markers and emphasis removed. Feeds both the search corpus and the meta
 * descriptions, which is why it lives here rather than beside either one.
 *
 * (Distinct from `plainText` above, which turns *rendered HTML* into text.)
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6} /gm, '')
    .replace(/[*_]/g, '');
}

function truncate(text: string): string {
  if (text.length <= DESCRIPTION_LIMIT) return text;
  const cut = text.slice(0, DESCRIPTION_LIMIT);

  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * Whole fenced blocks, removed before anything is split on blank lines. Skipping
 * blocks that *start* with a fence isn't enough: a snippet containing a blank
 * line splits into several, and every part after the first looks like prose —
 * which is how seven reference pages ended up describing themselves with a line
 * of their own example code.
 */
const FENCED_BLOCK = /^```[^\n]*\n[\s\S]*?\n```[^\n]*$/gm;

/** A doc's first prose paragraph, as plain text — the page's own meta description. */
export function summarize(markdown: string): string | undefined {
  const blocks = markdown.replace(/^# .+$/m, '').replace(FENCED_BLOCK, '').split(/\n{2,}/);
  // Trimmed inside `find`, not mapped first: the answer is almost always the
  // first or second block, and there is no reason to touch the rest of the page.
  const prose = blocks.find((block) => {
    const trimmed = block.trim();

    return trimmed.length > 0 && !NOT_PROSE.test(trimmed);
  });

  return prose ? truncate(stripMarkdown(prose).replace(/\s+/g, ' ').trim()) : undefined;
}

/**
 * Rendered docs, keyed by their own source. The pages are files that only change
 * when the site is rebuilt, so the second visitor to a page should not pay to
 * highlight it again — and on a server that renders every request, the home page
 * was paying for its five snippets every time (Lighthouse: 96, not 99). Bounded
 * by the corpus: 75 pages and a handful of inline samples.
 */
const rendered = new Map<string, Promise<RenderedDoc>>();

/** Renders a markdown doc with shiki highlighting, heading anchors, callouts and a TOC. */
export function renderMarkdown(markdown: string): Promise<RenderedDoc> {
  const cached = rendered.get(markdown) ?? render(markdown);

  rendered.set(markdown, cached);

  return cached;
}

async function render(markdown: string): Promise<RenderedDoc> {
  const highlighter = await getHighlighter();
  const toc: TocEntry[] = [];
  const md = new Marked();

  md.use({
    renderer: {
      code: codeRenderer(highlighter),
      heading: headingRenderer(toc),
      blockquote: calloutRenderer(),
    } as any,
  });
  const html = md.parse(markdown, { async: false }) as string;

  return { html, toc };
}
