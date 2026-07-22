import { glowElement, injectGlowStyles } from './glow';
import type { WebMCPToolDescriptor } from './webmcp';

export interface PageLink {
  path: string;
  label: string;
}

/** Bounds the tool payload on link-heavy pages. */
const MAX_LINKS = 100;

function toPageLink(anchor: HTMLAnchorElement): PageLink | undefined {
  const url = new URL(anchor.getAttribute('href') ?? '', location.href);

  if (url.origin !== location.origin) return undefined;

  return { path: url.pathname + url.search + url.hash, label: anchor.textContent?.trim() ?? '' };
}

/**
 * The app's real navigation surface: every same-origin link currently in the
 * DOM — which is exactly what the JSX projected, SSR'd or client-rendered,
 * with zero authoring effort.
 */
export function collectPageLinks(): PageLink[] {
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];

  return anchors
    .map(toPageLink)
    .filter((link): link is PageLink => link !== undefined)
    .filter((link, index, all) => all.findIndex((other) => other.path === link.path) === index)
    .slice(0, MAX_LINKS);
}

/** Long enough to see the glow on the link the agent "pressed", short enough to feel instant. */
const GLOW_BEFORE_NAV_MS = 350;

function anchorFor(path: string): HTMLAnchorElement | undefined {
  const matches = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(
    (anchor) => toPageLink(anchor)?.path === path,
  );

  // Sidebars often repeat a link in a hidden mobile drawer — glow the visible one.
  return matches.find((anchor) => anchor.getClientRects().length > 0) ?? matches[0];
}

function navigateTo(path: string): unknown {
  const links = collectPageLinks();
  const resolved = new URL(path, location.href);
  const wanted = resolved.pathname + resolved.search + resolved.hash;
  const target = links.find((link) => link.path === wanted);
  const anchor = target ? anchorFor(target.path) : undefined;

  // Models hallucinate paths; handing back the real links makes the retry self-correcting.
  if (!target) return { error: `No link to "${path}" on this page. Current links:`, links };
  if (anchor) {
    injectGlowStyles();
    glowElement(anchor);
    anchor.scrollIntoView({ block: 'nearest' });
  }
  setTimeout(() => location.assign(target.path), anchor ? GLOW_BEFORE_NAV_MS : 0);

  return { navigated: target.path, label: target.label };
}

/** The built-in `navigate` WebMCP tool `installWebMCP` registers on every page. */
export function createNavigateTool(): WebMCPToolDescriptor {
  return {
    name: 'navigate',
    description: 'Navigate this app to one of the links on the current page, by path.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Target path, e.g. /docs/guide/navigation' } },
      required: ['path'],
    },
    execute: (input) => navigateTo(String((input as { path?: unknown })?.path ?? '')),
  };
}
