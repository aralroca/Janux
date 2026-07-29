import { StoryList } from '../../components/StoryList';

export const meta = ({ params }: { params: { page: string } }) => ({
  title: `Janux HN — page ${params.page}`,
  description: 'Another page of the front page, streamed the same way.',
});

/** Same island as `/`, seeded with the page from the URL — `/news/2`, `/news/3`. */
export default function NewsPage({ params }: { params: { page: string } }) {
  return (
    <main class="page">
      <StoryList key={params.page} initial={{ page: Number(params.page) }} />
    </main>
  );
}
