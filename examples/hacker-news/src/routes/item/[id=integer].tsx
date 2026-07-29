import type { Story } from '../../data/stories';
import { CommentThread } from '../../components/CommentTree';
import { LiveScore } from '../../components/LiveScore';
import { getItem } from '../../server/hn.api';

export const meta = async ({ params }: { params: { id: string } }) => {
  const story = (await getItem({ id: Number(params.id) })) as Story | null;

  return {
    title: story ? `${story.title} — Janux HN` : 'Janux HN — no such item',
    description: 'One story with its server-rendered nested comment tree.',
  };
};

/** An async route: the comment tree arrives fully server-rendered, no JS involved. */
export default async function ItemPage({ params }: { params: { id: string } }) {
  const story = (await getItem({ id: Number(params.id) })) as Story | null;

  if (!story) {
    return (
      <main class="page item">
        <h1>No such item</h1>
        <p>
          <a href="/">← back to the front page</a>
        </p>
      </main>
    );
  }

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
