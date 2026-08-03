import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp, mockApi, resetApiMocks, type TestApp } from '@janux/testing';
import { getItem, listStories } from '../src/server/hn.api';

const ROOT = new URL('..', import.meta.url).pathname;

const STORY = {
  id: 1,
  title: 'A deterministic story',
  url: 'https://example.com',
  user: 'ada',
  points: 42,
  commentCount: 1,
  ageHours: 3,
};

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp(ROOT);
});

afterAll(() => app.close());
afterEach(resetApiMocks);

/**
 * The api()s behind these pages sleep on purpose (the streaming is the point of
 * the example). Mocked at the boundary they answer instantly, which is what
 * makes a route test about *routing* rather than about latency.
 */
describe('the front page renders what the story api returns', () => {
  it('lists the mocked stories, fully streamed', async () => {
    mockApi(listStories, () => [STORY]);
    const page = await app.render('/');

    expect(page.status).toBe(200);
    expect(page.html).toContain('A deterministic story');
    expect(page.html).toContain('42 points by ada');
  });

  it('serves the same list under a paged URL', async () => {
    mockApi(listStories, () => [STORY]);
    const page = await app.render('/news/2');

    expect(page.status).toBe(200);
    expect(page.html).toContain('<title>Janux HN — page 2</title>');
  });
});

describe('an item URL only matches on an integer id', () => {
  it('renders the story the id names', async () => {
    mockApi(getItem, () => ({ ...STORY, comments: [] }));
    const page = await app.render('/item/1');

    expect(page.status).toBe(200);
    expect(page.html).toContain('A deterministic story');
  });

  it('answers 404 when the segment is not an integer', async () => {
    expect((await app.render('/item/abc')).status).toBe(404);
  });
});
