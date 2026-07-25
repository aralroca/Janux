import { jsx, type PageMeta } from 'janux';

/** The override + escape-hatch half of the reference/server-api.md head section. */
export const meta: PageMeta = {
  title: 'An article',
  description: 'With overrides.',
  og: { type: 'article' },
  twitter: { site: '@janux' },
  jsonLd: [{ '@type': 'BreadcrumbList' }, { '@type': 'TechArticle' }],
  head: [{ tag: 'link', attrs: { rel: 'preload', as: 'image', href: '/demo-poster.jpg' } }],
};

export default function Article() {
  return jsx('main', { children: 'article' });
}
