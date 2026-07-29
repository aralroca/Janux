import { component, int, schema, source } from 'janux';
import { PAGE_SIZE, type StorySummary } from '../data/stories';
import { listStories } from '../server/hn.api';

function StoryRow({ story, rank }: { story: StorySummary; rank: number }) {
  const href = `/item/${story.id}`;

  return (
    <li class="story" key={String(story.id)}>
      <span class="rank">{rank}.</span>
      <span class="story-main">
        <a class="story-link" href={href}>
          {story.title}
        </a>{' '}
        <span class="domain">({story.domain})</span>
        <span class="subline">
          {story.points} points by {story.user} {story.age} ·{' '}
          <a class="comments-link" href={href}>
            {story.commentCount} comments
          </a>
        </span>
      </span>
    </li>
  );
}

/** Plain anchors: the router intercepts them and hover-prefetches the target page. */
function Pager({ page, pages }: { page: number; pages: number }) {
  return (
    <nav class="pager">
      {page > 1 ? (
        <a class="pager-prev" href={page === 2 ? '/' : `/news/${page - 1}`}>
          ‹ Prev
        </a>
      ) : null}
      {page < pages ? (
        <a class="pager-more" href={`/news/${page + 1}`}>
          More ›
        </a>
      ) : null}
    </nav>
  );
}

/**
 * The front page as one suspense island. Its source is deliberately slow, so
 * the skeleton streams first and the ranked list swaps in from the same
 * response. Sources cannot read state, so the source loads the whole fixture
 * and the view slices the page it was seeded with (`initial={{ page }}`).
 */
export const StoryList = component({
  name: 'story-list',
  description: 'The ranked story list for one front-page number.',
  state: schema({ page: int().default(1) }),
  sources: {
    stories: source({ query: () => listStories() }),
  },
  suspense: () => (
    <ol class="stories">
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        <li class="story skeleton" key={String(index)}>
          <span class="rank">·</span>
          <span class="skeleton-line">loading story…</span>
        </li>
      ))}
    </ol>
  ),
  view: ({ state, sources }: any) => {
    const stories = (sources.stories.value ?? []) as StorySummary[];
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = stories.slice(start, start + PAGE_SIZE);
    const pages = Math.ceil(stories.length / PAGE_SIZE);

    if (slice.length === 0) {
      return (
        <section class="front">
          <p class="empty">No more stories.</p>
          <Pager page={state.page} pages={pages} />
        </section>
      );
    }

    return (
      <section class="front">
        <ol class="stories">
          {slice.map((story, index) => (
            <StoryRow story={story} rank={start + index + 1} key={String(story.id)} />
          ))}
        </ol>
        <Pager page={state.page} pages={pages} />
      </section>
    );
  },
});
