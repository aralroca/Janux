// @file: app/blog/[slug]/page.tsx
import { PostBody } from './PostBody';
import { formatDate } from '../../../lib/dates';

export default function Post({ params }: { params: { slug: string } }) {
  return (
    <article>
      <h1>{params.slug}</h1>
      <p>{formatDate(new Date())}</p>
      <PostBody slug={params.slug} />
    </article>
  );
}
