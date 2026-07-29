import { notFound } from 'janux';
import type { Story } from '../../data/stories';
import { CommentThread } from '../../components/CommentTree';
import { LiveScore } from '../../components/LiveScore';
import { getItem } from '../../server/hn.api';

export const meta = async ({ params }: { params: { id: string } }) => {
  const story = (await getItem({ id: Number(params.id) })) as Story | null;

  // No such story: the page calls notFound() and `_404.tsx` brings its own meta.
  if (!story) return {};

  return {
    title: `${story.title} — Janux HN`,
    description: 'One story with its server-rendered nested comment tree.',
  };
};

/** An async route: the comment tree arrives fully server-rendered, no JS involved. */
export default async function ItemPage({ params }: { params: { id: string } }) {
  const story = (await getItem({ id: Number(params.id) })) as Story | null;

  // `[id=integer]` only proves the shape of the segment; whether that story
  // exists is a question only the data can answer — and 999 is a 404.
  if (!story) notFound();

  return (
    <main class="page item">
      <article class="story-header">
        <h1 class="item-title">
          {story.title} <span class="domain">({story.domain})</span>
        </h1>
        <p class="subline">
          <LiveScore initial={{ id: story.id, points: story.points, checks: 0 }} /> by {story.user}{' '}
          {story.age}
        </p>
      </article>
      <CommentThread comments={story.comments} />
    </main>
  );
}
