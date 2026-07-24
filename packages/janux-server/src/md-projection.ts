/**
 * Markdown projection of a rendered page (RFC 0002 §13.3): agents read pages
 * as clean text via the `.md` suffix or the content-MCP resources. A pragmatic
 * HTML→Markdown pass — headings, links, lists, paragraphs — over the SSR html.
 */

const BLOCK_DROP = /<(script|style|svg)[\s\S]*?<\/\1>/gi;

function decodeEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export function htmlToMarkdown(html: string): string {
  const markdown = html
    .replace(BLOCK_DROP, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(p|div|section|main|header|footer|ul|ol|tr)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return decodeEntities(markdown);
}

export function pageMarkdown(title: string | undefined, html: string): string {
  const body = htmlToMarkdown(html);

  return title && !body.startsWith('# ') ? `# ${title}\n\n${body}` : body;
}
