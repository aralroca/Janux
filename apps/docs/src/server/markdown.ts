import { Marked } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';

const THEME = 'one-dark-pro';
const LANGS = ['typescript', 'tsx', 'bash', 'json', 'jsonc', 'css', 'html'];

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [THEME], langs: LANGS });

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
    const highlighted = highlighter.codeToHtml(text, { lang: known, theme: THEME });

    if (!flags.includes('live')) return highlighted;

    return `<div class="live-block">${highlighted}<a class="try-it" href="/playground#c=${base64url(text)}">▶ Run in playground</a></div>`;
  };
}

function calloutRenderer() {
  return function blockquote(this: any, { tokens }: any): string {
    const body = this.parser.parse(tokens);
    const kind = /^<p><strong>(Note|Tip|Warning)/.exec(body)?.[1]?.toLowerCase();

    return kind ? `<aside class="callout ${kind}">${body}</aside>` : `<blockquote>${body}</blockquote>`;
  };
}

function headingRenderer(toc: TocEntry[]) {
  return function heading(this: any, { tokens, depth }: any): string {
    const text = this.parser.parseInline(tokens);
    const plain = text.replace(/<[^>]+>/g, '');
    const id = slugify(plain);

    if (depth === 2 || depth === 3) toc.push({ depth, id, text: plain });

    return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to ${plain}">#</a></h${depth}>`;
  };
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
