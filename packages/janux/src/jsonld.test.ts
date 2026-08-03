import { describe, expect, it } from 'bun:test';
import { articleJsonLd, breadcrumbJsonLd, organizationJsonLd } from './jsonld';

describe('articleJsonLd', () => {
  it('builds an Article node with the schema.org context by default', () => {
    expect(articleJsonLd({ headline: 'Hello' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hello',
    });
  });

  it('carries the subtype and maps section to articleSection', () => {
    const node = articleJsonLd({ type: 'TechArticle', headline: 'H', section: 'Guide / Basics' });

    expect(node['@type']).toBe('TechArticle');
    expect(node.articleSection).toBe('Guide / Basics');
    expect(node).not.toHaveProperty('section');
  });

  it('wraps the author as a schema.org Person', () => {
    expect(articleJsonLd({ headline: 'H', author: { name: 'Aral' } }).author).toEqual({
      '@type': 'Person',
      name: 'Aral',
    });
  });

  it('drops absent fields instead of serializing undefined', () => {
    const node = articleJsonLd({ headline: 'H', description: undefined });

    expect(Object.keys(node)).toEqual(['@context', '@type', 'headline']);
  });

  it('keeps dates as the ISO strings content collections store', () => {
    const node = articleJsonLd({ headline: 'H', datePublished: '2026-07-01', dateModified: '2026-07-02' });

    expect(node.datePublished).toBe('2026-07-01');
    expect(node.dateModified).toBe('2026-07-02');
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers the crumbs from one, in order', () => {
    const node = breadcrumbJsonLd([
      { name: 'Docs', url: 'https://site.test/' },
      { name: 'Guide', url: 'https://site.test/guide' },
    ]);

    expect(node['@type']).toBe('BreadcrumbList');
    expect(node.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Docs', item: 'https://site.test/' },
      { '@type': 'ListItem', position: 2, name: 'Guide', item: 'https://site.test/guide' },
    ]);
  });

  it('omits item on a URL-less crumb, as validators require for the last one', () => {
    const [last] = breadcrumbJsonLd([{ name: 'This page' }]).itemListElement;

    expect(last).toEqual({ '@type': 'ListItem', position: 1, name: 'This page' });
  });
});

describe('organizationJsonLd', () => {
  it('builds an Organization node and drops absent fields', () => {
    expect(organizationJsonLd({ name: 'Janux', url: 'https://janux.build' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Janux',
      url: 'https://janux.build',
    });
  });

  it('carries logo and sameAs profiles when given', () => {
    const node = organizationJsonLd({ name: 'Janux', logo: 'https://janux.build/logo.png', sameAs: ['https://github.com/aralroca/Janux'] });

    expect(node.logo).toBe('https://janux.build/logo.png');
    expect(node.sameAs).toEqual(['https://github.com/aralroca/Janux']);
  });
});
