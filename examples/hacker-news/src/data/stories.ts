/**
 * Deterministic local fixture: 30 stories with nested comment trees, derived
 * from pure formulas over the story id. No network, no randomness — the same
 * bytes on every run, which is what lets the e2e suite assert exact content.
 */

export interface Comment {
  id: string;
  user: string;
  text: string;
  replies: Comment[];
}

export interface Story {
  id: number;
  title: string;
  domain: string;
  points: number;
  user: string;
  age: string;
  comments: Comment[];
}

export interface StorySummary extends Omit<Story, 'comments'> {
  commentCount: number;
}

export const PAGE_SIZE = 10;

const TITLES = [
  'Show HN: A text editor that fits in 4 KB of WebAssembly',
  'The database your filesystem already is',
  'Why we rewrote our build pipeline in Rust',
  'Streaming HTML is older than you think',
  'Ask HN: What is your favorite paper of the decade?',
  'Resumability vs hydration, measured',
  'A tour of the Navigation API',
  'SQLite is all you need for the first million users',
  'Speculation rules, explained with demos',
  'The case against microservices at seed stage',
  'Postgres as a message queue was the right call',
  'Show HN: I built a plotter that draws with sea water',
  'Writing a tiny compiler on a long flight',
  'How CDNs decide what to cache',
  'The forgotten art of the man page',
  'Ask HN: How do you archive your family photos?',
  'Islands architecture, five years in',
  'A gentle introduction to CRDTs',
  'What happens when you type janux dev',
  'Show HN: A keyboard firmware written in TypeScript',
  'Debugging a race that only happened on Fridays',
  'The economics of self-hosting in 2026',
  'Every big idea in databases, in one page',
  'Why skeleton screens feel faster',
  'Building a search engine over my bookmarks',
  'Show HN: Deterministic fixtures for flaky-free tests',
  'How we cut our bundle from 60 KB to 24 KB',
  'The slow web is a feature',
  'Ask HN: Do you still read RSS?',
  'Content negotiation deserves a comeback',
];

const USERS = ['ada', 'grace', 'linus', 'ken', 'dennis', 'barbara', 'edsger', 'donald'];

const DOMAINS = ['example.com', 'janux.build', 'arxiv.org', 'github.com', 'sqlite.org', 'postgresql.org'];

const PHRASES = [
  'Great writeup, thanks for sharing.',
  'I benchmarked this and got similar numbers.',
  'The tradeoff section matches our experience in production.',
  'Related work worth reading before adopting this.',
  'We moved away from this approach last year.',
  'Solid idea, the details are what convinced me.',
];

const range = (length: number) => Array.from({ length }, (_, index) => index);

/** Reply fan-out shrinks with depth and stops at 3, so every tree is small and finite. */
function makeComment(storyId: number, path: number[]): Comment {
  const id = [storyId, ...path].join('-');
  const depth = path.length;
  const last = path[depth - 1]!;
  const seed = storyId + depth + last;
  const replyCount = depth >= 3 ? 0 : seed % (5 - depth);

  return {
    id,
    user: USERS[seed % USERS.length]!,
    text: `${PHRASES[(storyId + depth * 2 + last) % PHRASES.length]} (c${id})`,
    replies: range(replyCount).map((index) => makeComment(storyId, [...path, index + 1])),
  };
}

function makeStory(id: number): Story {
  return {
    id,
    title: TITLES[id - 1]!,
    domain: DOMAINS[id % DOMAINS.length]!,
    points: ((id * 37) % 290) + 12,
    user: USERS[id % USERS.length]!,
    age: `${(id % 23) + 1}h ago`,
    comments: range((id % 3) + 2).map((index) => makeComment(id, [index + 1])),
  };
}

export const STORIES: Story[] = range(TITLES.length).map((index) => makeStory(index + 1));

export function countComments(comments: Comment[]): number {
  return comments.reduce((total, comment) => total + 1 + countComments(comment.replies), 0);
}

export function summaries(): StorySummary[] {
  return STORIES.map(({ comments, ...story }) => ({ ...story, commentCount: countComments(comments) }));
}
