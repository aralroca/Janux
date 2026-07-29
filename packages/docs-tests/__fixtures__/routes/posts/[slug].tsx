import { jsx, notFound } from 'janux';

const POSTS: Record<string, string> = { hello: 'Hello world' };

const postBySlug = (slug: string) => POSTS[slug];

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);

  if (!post) notFound();

  return jsx('article', { children: post });
}
