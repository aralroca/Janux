// @file: src/routes/blog/[slug]/index.tsx
export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: params.slug, description: `The post about ${params.slug}` };
}

export default function Post({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1>;
}
