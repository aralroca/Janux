import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { unsuspense, UNSUSPENSE_RUNTIME } from './unsuspense';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/' }));
afterAll(() => GlobalRegistrator.unregister());

function pendingIsland(id: string, fallback: string): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<janux-island key="${id}" data-jx="${id}" data-jx-pending>${fallback}</janux-island>`,
  );
}

function completion(id: string, content: string): HTMLScriptElement {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<template id="jxu:${id}" key="jxt:${id}">${content}</template><script data-jxu-run key="jxu:${id}"></script>`,
  );

  return document.querySelector(`script[key="jxu:${id}"]`) as HTMLScriptElement;
}

describe('unsuspense (jx$u)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (self as any).jx$p = undefined;
  });

  it('swaps the template content into the pending island and cleans up', () => {
    pendingIsland('slow#default', '<p>wait</p>');
    const script = completion('slow#default', '<p>ready</p>');

    unsuspense('slow#default', script);
    const island = document.querySelector('janux-island')!;

    expect(island.innerHTML).toBe('<p>ready</p>');
    expect(island.hasAttribute('data-jx-pending')).toBe(false);
    expect(document.getElementById('jxu:slow#default')).toBeNull();
    expect(script.isConnected).toBe(false);
  });

  it('keeps a boundary pending while its host sits inside another template, then sweeps it', () => {
    // The inner island's host is inert content of the outer template. Built via
    // `content` explicitly: happy-dom's insertAdjacentHTML parses template
    // children as regular (queryable) children, unlike a browser.
    pendingIsland('outer#default', '<p>wait</p>');
    const outerTemplate = document.createElement('template');
    const innerHost = document.createElement('janux-island');

    outerTemplate.id = 'jxu:outer#default';
    innerHost.setAttribute('data-jx', 'inner#o.1');
    innerHost.setAttribute('data-jx-pending', '');
    innerHost.innerHTML = '<p>wait</p>';
    outerTemplate.content.appendChild(innerHost);
    document.body.appendChild(outerTemplate);
    document.body.insertAdjacentHTML('beforeend', '<template id="jxu:inner#o.1"><p>inner-ready</p></template>');

    unsuspense('inner#o.1', null);
    expect(document.querySelector('[data-jx="inner#o.1"]')).toBeNull();

    unsuspense('outer#default', null);
    const inner = document.querySelector('[data-jx="inner#o.1"]')!;

    expect(inner.innerHTML).toBe('<p>inner-ready</p>');
    expect(inner.hasAttribute('data-jx-pending')).toBe(false);
  });

  it('drops a stale key whose template is gone (navigated away)', () => {
    unsuspense('gone#default', null);

    expect(((self as any).jx$p as Set<string>).size).toBe(0);
  });

  it('removes the call script even when the swap cannot happen yet', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<template id="jxu:later#default"><p>x</p></template><script data-jxu-run></script>',
    );
    const script = document.querySelector('script[data-jxu-run]') as HTMLScriptElement;

    unsuspense('later#default', script);

    expect(script.isConnected).toBe(false);
    expect((self as any).jx$p.has('later#default')).toBe(true);
  });

  it('the serialized runtime is valid standalone JS and installs jx$u', () => {
    pendingIsland('ser#default', '<p>wait</p>');
    completion('ser#default', '<p>ready</p>');

    new Function(UNSUSPENSE_RUNTIME)();
    (self as any).jx$u('ser#default', null);

    expect(document.querySelector('janux-island')!.innerHTML).toBe('<p>ready</p>');
  });
});
