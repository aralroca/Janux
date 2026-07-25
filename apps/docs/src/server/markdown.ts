import { Marked } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;
const LANGS = ['typescript', 'tsx', 'bash', 'json', 'jsonc', 'css', 'html'];

/**
 * Two token colors in GitHub's themes don't clear 4.5:1 as body-sized code text,
 * measured against both the block background and the page's: the light orange
 * (3.49 on white — it lands on `state`, `input`, `intents`) and the dark comment
 * grey (3.05 on the page background). Darkened/lightened in place, same hue, so
 * the themes still read as GitHub's.
 */
const CONTRAST_FIXES = {
  'github-light': { '#e36209': '#bd4b00' },
  'github-dark': { '#6a737d': '#8b949e' },
} as const;

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: Object.values(THEMES), langs: LANGS });

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

function codeRenderer(highlighter: Highlighter) {
  return ({ text, lang }: { text: string; lang?: string }): string => {
    const [language = 'text', ...flags] = (lang ?? '').split(/\s+/);
    const known = highlighter.getLoadedLanguages().includes(language) ? language : 'text';
    // light-dark() colors follow the page's `color-scheme`, so code blocks flip
    // with the theme toggle without any extra CSS plumbing.
    const highlighted = highlighter.codeToHtml(text, {
      lang: known,
      themes: THEMES,
      colorReplacements: CONTRAST_FIXES,
      defaultColor: 'light-dark()',
    });

    const tryIt = flags.includes('live')
      ? `<a class="try-it" href="/playground#c=${base64url(text)}">▶ Run in playground</a>`
      : '';

    return `<div class="code-block">${highlighted}<div class="block-actions"><button class="copy-code" type="button" aria-label="Copy code">Copy</button>${tryIt}</div></div>`;
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

/** Renders a markdown doc with shiki highlighting, heading anchors, callouts and a TOC. */
export async function renderMarkdown(markdown: string): Promise<RenderedDoc> {
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
