import { CLIENT_TOOL_NAMES } from '../client-tools/specs';
import { glowElement, injectGlowStyles } from './glow';
import { collectPageLinks, createNavigateTool } from './navigate-tool';

export { CLIENT_TOOL_NAMES };

interface PageElement {
  role: string;
  label: string;
  selector: string;
}

function selectorFor(el: Element): string {
  if (el.id) return `#${el.id}`;
  const testid = el.getAttribute('data-testid');

  if (testid) return `[data-testid="${testid}"]`;
  const name = el.getAttribute('name');

  if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
  const text = (el.textContent ?? '').trim().slice(0, 40);
  const siblings = [...document.querySelectorAll(el.tagName)].filter(
    (other) => (other.textContent ?? '').trim().slice(0, 40) === text,
  );
  const index = siblings.indexOf(el);

  return `${el.tagName.toLowerCase()}:nth-of-type-match(${index})|text=${text}`;
}

function describe(el: Element, role: string): PageElement {
  const label =
    el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? (el.textContent ?? '').trim().slice(0, 60);

  return { role, label, selector: selectorFor(el) };
}

/** Accessibility-style snapshot: what a sighted user sees, with actionable selectors. */
function readPage(): unknown {
  const pick = (selector: string, role: string) =>
    [...document.querySelectorAll(selector)].filter((el) => (el as HTMLElement).getClientRects().length > 0).slice(0, 80).map((el) => describe(el, role));

  return {
    path: location.pathname + location.search,
    title: document.title,
    headings: pick('h1,h2,h3', 'heading'),
    buttons: pick('button,[role="button"]', 'button'),
    inputs: pick('input,textarea,select', 'input'),
    links: collectPageLinks(),
  };
}

function resolve(selector: string): Element {
  const [css, text] = selector.split('|text=');
  const el = text
    ? [...document.querySelectorAll(css!.replace(/:nth-of-type-match\(\d+\)/, ''))].find(
        (candidate) => (candidate.textContent ?? '').trim().startsWith(text),
      )
    : document.querySelector(selector);

  if (!el) throw new Error(`ui tool: no element matches "${selector}"`);

  return el;
}

function click(selector: string): unknown {
  const el = resolve(selector) as HTMLElement;

  injectGlowStyles();
  glowElement(el, 1200);
  el.click();

  return { clicked: selector };
}

function fill(selector: string, value: string): unknown {
  const el = resolve(selector) as HTMLInputElement;

  injectGlowStyles();
  glowElement(el, 1200);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { filled: selector, value };
}

function viewContext(): unknown {
  const islands = [...document.querySelectorAll('janux-island[data-jx]')].map((el) => el.getAttribute('data-jx'));

  return { path: location.pathname + location.search, title: document.title, links: collectPageLinks(), islands };
}

/** Executes one built-in client tool (names in CLIENT_TOOL_NAMES). */
export async function executeClientTool(name: string, input: any, settled: () => Promise<void>): Promise<unknown> {
  switch (name) {
    case 'ui_navigate': {
      const result = createNavigateTool().execute(input);

      await settled();

      return result ?? { navigated: input?.path };
    }
    case 'ui_get_view_context':
      return viewContext();
    case 'ui_read_page':
      return readPage();
    case 'ui_click':
      return click(String(input?.selector ?? ''));
    case 'ui_fill':
      return fill(String(input?.selector ?? ''), String(input?.value ?? ''));
    case 'ui_wait_settled':
      await settled();

      return { settled: true };
    default:
      throw new Error(`ui tool: unknown built-in "${name}"`);
  }
}
