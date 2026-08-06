import { glowElement, injectGlowStyles } from './feedback';
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

async function navigateTo(path: string): Promise<unknown> {
  const links = collectPageLinks();
  const resolved = new URL(path, location.href);

  // Models hallucinate origins; same-origin only, and the real links make the retry self-correcting.
  if (resolved.origin !== location.origin) {
    return { error: `"${path}" is cross-origin. Current links:`, links };
  }
  const wanted = resolved.pathname + resolved.search + resolved.hash;
  const anchor = anchorFor(wanted) ?? anchorFor(resolved.pathname);

  if (anchor) {
    injectGlowStyles();
    glowElement(anchor);
    anchor.scrollIntoView({ block: 'nearest' });
    await new Promise((resolve) => setTimeout(resolve, GLOW_BEFORE_NAV_MS));
  }
  // SPA navigation keeps the app (and any copilot surface) alive; paths beyond
  // the current page's links are legitimate — the manifest route map covers them.
  const client = (window as any).janux;

  if (client?.navigate) await client.navigate(wanted);
  else location.assign(wanted);

  return { navigated: wanted, label: anchor?.textContent?.trim() };
}

/** The built-in `navigate` WebMCP tool `installWebMCP` registers on every page. */
export function createNavigateTool(): WebMCPToolDescriptor {
  return {
    name: 'navigate',
    description: 'Navigate this app to any same-origin path (SPA navigation).',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Target path, e.g. /docs/guide/navigation' } },
      required: ['path'],
    },
    execute: (input) => navigateTo(String((input as { path?: unknown })?.path ?? '')),
  };
}
