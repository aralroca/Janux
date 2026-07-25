import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { CLIENT_TOOL_SPECS } from '../client-tools/specs';
import { CLIENT_TOOL_NAMES, executeClientTool } from './client-tools';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost/' }));
afterAll(() => GlobalRegistrator.unregister());

const settled = () => Promise.resolve();

describe('built-in client tools', () => {
  it('every spec has an executor (specs and switch stay in sync)', async () => {
    document.body.innerHTML = '<main></main>';
    for (const spec of CLIENT_TOOL_SPECS) {
      expect(CLIENT_TOOL_NAMES.has(spec.name)).toBe(true);
      // ui_click/ui_fill throw on missing elements — that's still "wired".
      await executeClientTool(spec.name, { path: '/', selector: 'main', value: 'x' }, settled).catch(() => undefined);
    }
  });

  it('ui_read_page snapshots visible headings, buttons, inputs and links', async () => {
    document.body.innerHTML =
      '<h1>Dashboard</h1><button id="edit">Edit</button><input name="q" placeholder="Search" /><a href="/kyc">KYC</a>';
    const page = (await executeClientTool('ui_read_page', {}, settled)) as any;

    expect(page.headings[0].label).toBe('Dashboard');
    expect(page.buttons[0].selector).toBe('#edit');
    expect(page.inputs[0].selector).toBe('input[name="q"]');
  });

  it('ui_click clicks the resolved element and ui_fill dispatches input events', async () => {
    let clicked = false;
    let value = '';

    document.body.innerHTML = '<button id="go">Go</button><input id="name" />';
    document.querySelector('#go')!.addEventListener('click', () => (clicked = true));
    document.querySelector('#name')!.addEventListener('input', (e) => (value = (e.target as HTMLInputElement).value));
    await executeClientTool('ui_click', { selector: '#go' }, settled);
    await executeClientTool('ui_fill', { selector: '#name', value: 'Ada' }, settled);

    expect(clicked).toBe(true);
    expect(value).toBe('Ada');
  });

  /**
   * The DOM-fallback tools report WHAT they touched; painting it is the feedback
   * layer's job (`enableAgentGlow`, or a richer visualizer). They used to call
   * `glowElement` themselves, so the built-in box-shadow was hardcoded: an app
   * that opted out of the glow still got it, and no other visualization could
   * take over.
   */
  it('ui_click and ui_fill emit janux:tool-target instead of painting', async () => {
    const targets: any[] = [];
    const onTarget = (event: any) => targets.push(event.detail);

    document.body.innerHTML = '<button id="go">Go</button><input id="name" />';
    document.getElementById('janux-glow-styles')?.remove();
    document.addEventListener('janux:tool-target', onTarget);
    await executeClientTool('ui_click', { selector: '#go' }, settled);
    await executeClientTool('ui_fill', { selector: '#name', value: 'Ada' }, settled);
    document.removeEventListener('janux:tool-target', onTarget);

    expect(targets.map((target) => target.action)).toEqual(['click', 'fill']);
    expect(targets[0].element).toBe(document.getElementById('go'));
    expect(targets[1].element).toBe(document.getElementById('name'));
    expect(targets[1].selector).toBe('#name');
    expect(document.querySelectorAll('.janux-agent-glow')).toHaveLength(0);
    expect(document.getElementById('janux-glow-styles')).toBeNull();
  });

  it('ui_get_view_context reports path, links and mounted islands', async () => {
    document.body.innerHTML = '<a href="/x">x</a><janux-island data-jx="cart#default"></janux-island>';
    const context = (await executeClientTool('ui_get_view_context', {}, settled)) as any;

    expect(context.islands).toContain('cart#default');
    expect(context.links.some((link: any) => link.path === '/x')).toBe(true);
  });
});
