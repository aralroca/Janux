import { jsx, notFound } from 'janux';

const POSTS: Record<string, string> = { hello: 'Hello world' };

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = POSTS[params.slug];

  if (!post) notFound();

  return jsx('article', { children: post });
}
