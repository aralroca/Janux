import { describe, expect, test } from 'bun:test';
import { activeTopLink } from './Layout';

const DOCS = '/docs/getting-started/what-is-janux';

describe('activeTopLink', () => {
  test('lights up the link the page is on', () => {
    expect(activeTopLink(DOCS)).toBe(DOCS);
    expect(activeTopLink('/playground')).toBe('/playground');
    expect(activeTopLink('/docs/more/templates')).toBe('/docs/more/templates');
    expect(activeTopLink('/docs/more/examples')).toBe('/docs/more/examples');
  });

  test('any other doc page lights up Docs', () => {
    expect(activeTopLink('/docs/routing/pages')).toBe(DOCS);
  });

  test('Templates and Examples win over Docs on their own pages', () => {
    expect(activeTopLink('/docs/more/templates')).not.toBe(DOCS);
    expect(activeTopLink('/docs/more/examples')).not.toBe(DOCS);
  });

  test('pages outside the top links light up nothing', () => {
    expect(activeTopLink('/')).toBeUndefined();
    expect(activeTopLink(undefined)).toBeUndefined();
  });
});
