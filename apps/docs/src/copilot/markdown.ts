import { marked } from 'marked';
import remend from 'remend';

/**
 * The model writes markdown; the panel shows HTML. Two things make that safe
 * and readable: `remend` closes the syntax a half-arrived answer left open (so
 * `**bol` is bold, not two asterisks), and the result is scrubbed as a DOM tree
 * rather than with regexes — an attribute list is something you can enumerate,
 * a regex over HTML is something you hope about.
 */
/**
 * `template` is here because its children live in a `DocumentFragment` that
 * `querySelectorAll` never walks — anything inside it would skip the scrub
 * entirely. `animate`/`set` are SMIL, which can retarget an `href` at runtime.
 * None of them are reachable from markdown, so removing them costs nothing.
 */
const DANGEROUS = 'script, style, iframe, object, embed, link, meta, base, form, template, animate, set';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction'];
/**
 * An answer is prose in a chat bubble; it has no business positioning itself.
 * A surviving `style` is a fixed full-viewport overlay over the docs (phishing)
 * and a `background-image: url(…)` beacon that fires with no click — and the
 * text it is built from includes doc pages and the visitor's own question.
 */
const STRIPPED_ATTRS = ['style'];
const EXECUTABLE = /^(?:javascript|vbscript|data):/;
/** Browsers ignore control characters and spaces inside a scheme: `java\tscript:` runs. */
const SCHEME_NOISE = /[\u0000-\u0020]/g;

function isExecutableUrl(value: string): boolean {
  return EXECUTABLE.test(value.replace(SCHEME_NOISE, '').toLowerCase());
}

function scrubAttributes(element: Element): void {
  [...element.attributes].forEach(({ name, value }) => {
    const attr = name.toLowerCase();

    if (attr.startsWith('on') || STRIPPED_ATTRS.includes(attr)) element.removeAttribute(name);
    if (URL_ATTRS.includes(attr) && isExecutableUrl(value)) element.removeAttribute(name);
  });
}

/** Docs links stay in the SPA (the Navigation API owns them); anything else opens away. */
function markExternal(anchor: HTMLAnchorElement): void {
  const href = anchor.getAttribute('href') ?? '';

  if (href.startsWith('/') || href.startsWith('#')) return;
  anchor.setAttribute('target', '_blank');
  anchor.setAttribute('rel', 'noopener noreferrer');
}

export function renderMarkdown(text: string): string {
  const template = document.createElement('template');

  template.innerHTML = marked.parse(remend(text, { linkMode: 'text-only' }), { async: false }) as string;
  template.content.querySelectorAll(DANGEROUS).forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach(scrubAttributes);
  template.content.querySelectorAll('a').forEach(markExternal);

  return template.innerHTML;
}
