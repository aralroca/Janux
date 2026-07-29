/**
 * A deliberately tiny markdown renderer — headings, paragraphs, lists, fenced
 * code, links, bold and inline code. Post bodies are authored against exactly
 * this subset (blank line between blocks, `##`/`###` headings only), so the
 * example stays dependency-free and readable end to end.
 */

const HEADING = /^(#{2,3}) (.+)$/;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function heading(match: RegExpExecArray): string {
  const depth = match[1]!.length;

  return `<h${depth}>${inline(match[2]!)}</h${depth}>`;
}

function list(block: string): string {
  const items = block.split('\n').map((line) => `<li>${inline(line.slice(2))}</li>`);

  return `<ul>${items.join('')}</ul>`;
}

function codeBlock(block: string): string {
  const [fence = '', ...rest] = block.split('\n');
  const lang = fence.slice(3).trim();
  const body = rest.filter((line) => !line.startsWith('```')).join('\n');

  return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(body)}</code></pre>`;
}

function renderBlock(block: string): string {
  const headed = HEADING.exec(block);

  if (block.startsWith('```')) return codeBlock(block);
  if (headed) return heading(headed);
  if (block.split('\n').every((line) => line.startsWith('- '))) return list(block);

  return `<p>${inline(block.replaceAll('\n', ' '))}</p>`;
}

export function markdownToHtml(source: string): string {
  return source
    .trim()
    .split(/\n{2,}/)
    .map((block) => renderBlock(block.trim()))
    .join('\n');
}
