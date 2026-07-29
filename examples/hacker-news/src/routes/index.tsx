import { StoryList } from '../components/StoryList';

export const meta = {
  title: 'Janux HN — the front page',
  description: 'A Hacker News clone: streaming SSR, pagination, nested comments.',
};

export default function Front() {
  return (
    <main class="page">
      <StoryList key="1" initial={{ page: 1 }} />
    </main>
  );
}
