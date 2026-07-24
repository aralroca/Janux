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
  it('glows the pressed link, then SPA-navigates', async () => {
    const navigate = mock(async (path: string) => path);

    (window as any).janux = { navigate };
    const pending = createNavigateTool().execute({ path: '/docs/guide/cli-and-deployment' }) as Promise<any>;
    const anchor = document.querySelector('a[href="/docs/guide/cli-and-deployment"]')!;

    expect(anchor.classList.contains(GLOW_CLASS)).toBe(true);
    const result = await pending;

    expect(result).toEqual({ navigated: '/docs/guide/cli-and-deployment', label: 'CLI and deployment' });
    expect(navigate).toHaveBeenCalledWith('/docs/guide/cli-and-deployment');
  });

  it('navigates to any same-origin path, even without a matching link (route-map targets)', async () => {
    const navigate = mock(async (path: string) => path);

    (window as any).janux = { navigate };
    const result = (await createNavigateTool().execute({ path: '/transactions?tab=settings' })) as any;

    expect(result.navigated).toBe('/transactions?tab=settings');
    expect(navigate).toHaveBeenCalledWith('/transactions?tab=settings');
  });

  it('rejects cross-origin paths and returns the real links', async () => {
    const navigate = mock(async (path: string) => path);

    (window as any).janux = { navigate };
    const result = (await createNavigateTool().execute({ path: 'https://evil.test/x' })) as any;

    expect(navigate).not.toHaveBeenCalled();
    expect(result.links.map((link: any) => link.path)).toContain('/docs/guide/components');
  });
});
