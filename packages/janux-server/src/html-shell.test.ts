import { describe, expect, it } from 'bun:test';
import { htmlDocument, type ShellOptions } from './html-shell';

const base: ShellOptions = {
  html: '<main>hi</main>',
  snapshots: [],
  islandNames: [],
};

// These guard the SPA-navigation FOUC fix: head resource links must be keyed
// (matched by identity across the diff) and the conditional description meta
// must sit AFTER the stylesheets, so omitting it never shifts the stylesheet's
// position — otherwise the diff re-resolves it and the page flashes unstyled.
describe('htmlDocument head keying (SPA-navigation FOUC guard)', () => {
  it('gives stylesheet, favicon and manifest links a stable id', () => {
    const html = htmlDocument({
      ...base,
      stylesheets: ['/styles.css'],
      favicon: '/favicon.svg',
      manifestUrl: '/_janux/manifest',
    });

    expect(html).toContain('<link rel="stylesheet" id="jx-style-0" href="/styles.css">');
    expect(html).toContain('<link rel="icon" id="jx-favicon" href="/favicon.svg">');
    expect(html).toContain('id="jx-manifest"');
  });

  it('places the conditional description meta after the stylesheet links', () => {
    const html = htmlDocument({ ...base, stylesheets: ['/styles.css'], description: 'D' });

    expect(html.indexOf('id="jx-style-0"')).toBeLessThan(html.indexOf('name="description"'));
  });
});
