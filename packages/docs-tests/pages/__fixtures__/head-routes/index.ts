import { jsx, type PageMeta } from 'janux';

/** The `PageMeta` example from reference/server-api.md, in shape. */
export function meta(): PageMeta {
  return {
    title: 'What is Janux? — Janux docs',
    description: 'The fullstack framework for the Agentic Web.',
    image: '/og/what-is-janux.png',
    canonical: '/docs/getting-started/what-is-janux',
    robots: 'index,follow',
    jsonLd: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'What is Janux?' },
  };
}

export default function Page() {
  return jsx('main', { children: 'What is Janux?' });
}
