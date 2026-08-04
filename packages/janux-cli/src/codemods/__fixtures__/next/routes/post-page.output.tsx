// @file: src/routes/blog/[slug]/index.tsx
import { PostBody } from '../../../components/blog/[slug]/PostBody';
import { formatDate } from '../../../../lib/dates';

export default function Post({ params }: { params: { slug: string } }) {
  return (
    <article>
      <h1>{params.slug}</h1>
      <p>{formatDate(new Date())}</p>
      <PostBody slug={params.slug} />
    </article>
  );
}
