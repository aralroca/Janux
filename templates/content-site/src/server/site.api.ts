import { api } from '@janux/server';
import { bool, list, schema, str } from 'janux';
import { publishedPosts } from '../content';

// In-memory on purpose: every server boot starts empty, so the scripted evals
// in evals/ are deterministic run after run. Swap for your database or email
// provider and keep the tool contract identical.
const subscribers = new Set<string>();

const hit = { slug: str(), title: str(), summary: str(), url: str(), markdown: str() };

/** Case-insensitive match over everything a reader could see: header and body. */
function matches(post: { data: { title: string; summary: string; tags: string[] }; body: string }, q: string): boolean {
  const haystack = [post.data.title, post.data.summary, post.data.tags.join(' '), post.body].join(' ').toLowerCase();

  return haystack.includes(q.toLowerCase());
}

export const search = api({
  description:
    'Search every published post by keyword (title, summary, tags and body). ' +
    'Each hit links the page and its markdown projection. Drafts are never returned.',
  input: schema({ q: str().min(1) }),
  output: schema({ hits: list(hit) }),
  run: ({ input }) => ({
    hits: publishedPosts()
      .filter((post) => matches(post, input.q))
      .map((post) => ({
        slug: post.id,
        title: post.data.title,
        summary: post.data.summary,
        url: `/posts/${post.id}`,
        markdown: `/posts/${post.id}.md`,
      })),
  }),
});

export const subscribe = api({
  description: 'Subscribe an email address to new-post announcements. Idempotence is refused loudly, not silently.',
  input: schema({ email: str().min(3) }),
  output: schema({ email: str(), subscribed: bool() }),
  run: ({ input }) => {
    if (!input.email.includes('@')) throw new Error(`"${input.email}" is not an email address`);
    if (subscribers.has(input.email)) throw new Error(`${input.email} is already subscribed`);
    subscribers.add(input.email);

    return { email: input.email, subscribed: true };
  },
});
