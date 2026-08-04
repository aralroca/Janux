// @file: src/routes/blog/index.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The blog',
  description: 'Everything we have written down.',
  metadataBase: new URL('https://example.dev'),
  alternates: { canonical: '/blog' },
  keywords: ['janux', 'agentic web'],
  openGraph: {
    type: 'article',
    siteName: 'Example',
    images: ['/og/blog.png'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og/blog.png'],
  },
  robots: { index: true, follow: true },
};

export default function Blog() {
  return <h1>The blog</h1>;
}
