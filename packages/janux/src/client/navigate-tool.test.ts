import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { GLOW_CLASS } from './glow';
import { collectPageLinks, createNavigateTool } from './navigate-tool';

beforeAll(() => GlobalRegistrator.register({ url: 'https://app.test/docs/guide/components' }));
afterAll(() => GlobalRegistrator.unregister());

beforeEach(() => {
  document.body.innerHTML = `
    <nav>
      <a href="/docs/guide/components">Components</a>
      <a href="/docs/guide/cli-and-deployment">CLI and deployment</a>
      <a href="/docs/guide/cli-and-deployment">CLI (duplicate)</a>
      <a href="https://github.com/aralroca/Janux">GitHub</a>
    </nav>`;
});

describe('collectPageLinks', () => {
  it('collects same-origin links, deduped, keeping the first label', () => {
    const links = collectPageLinks();

    expect(links).toEqual([
      { path: '/docs/guide/components', label: 'Components' },
      { path: '/docs/guide/cli-and-deployment', label: 'CLI and deployment' },
    ]);
  });
});

describe('createNavigateTool', () => {
  it('glows the pressed link, then navigates', async () => {
    const assign = mock((path: string) => path);

    (location as any).assign = assign;
    const result = createNavigateTool().execute({ path: '/docs/guide/cli-and-deployment' });
    const anchor = document.querySelector('a[href="/docs/guide/cli-and-deployment"]')!;

    expect(result).toEqual({ navigated: '/docs/guide/cli-and-deployment', label: 'CLI and deployment' });
    expect(anchor.classList.contains(GLOW_CLASS)).toBe(true);
    expect(assign).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 420));
    expect(assign).toHaveBeenCalledWith('/docs/guide/cli-and-deployment');
  });

  it('rejects paths not linked on the page and returns the real links', () => {
    const assign = mock((path: string) => path);

    (location as any).assign = assign;
    const result = createNavigateTool().execute({ path: '/docs/made/up' }) as any;

    expect(assign).not.toHaveBeenCalled();
    expect(result.links.map((link: any) => link.path)).toContain('/docs/guide/components');
  });
});
