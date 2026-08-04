// @file: src/routes/blog/index.tsx
import type { PageMeta } from 'janux';

export const meta: PageMeta = {
  title: 'The blog',
  description: 'Everything we have written down.',
  canonical: '/blog',
  keywords: ['janux', 'agentic web'],
  og: {
    type: 'article',
    siteName: 'Example',
    image: '/og/blog.png',
  },
  twitter: {
    card: 'summary_large_image',
    image: '/og/blog.png',
  },
  robots: { index: true, follow: true },
};

export default function Blog() {
  return <h1>The blog</h1>;
}
