import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot, isBuilt, launchChrome, openPage, serveBuilt, ssrApp, TIMEOUT } from './support/app';

const APP = 'examples/with-content';
const DIST = join(appRoot(APP), 'dist/client');
const PUBLISHED = ['charting-with-react', 'interactive-content', 'agent-readable-content', 'typed-frontmatter'];
const DRAFT = 'still-a-draft';

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];

beforeAll(async () => {
  ({ server, get } = await ssrApp(APP));
});

const distPage = (page: string) => readFileSync(join(DIST, page.slice(1), 'index.html'), 'utf8');

describe('examples/with-content collections', () => {
  it('lists every published note, newest first', async () => {
    const html = await (await get('/')).text();
    const positions = PUBLISHED.map((slug) => html.indexOf(`href="/notes/${slug}"`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((first, second) => first - second)).toEqual(positions);
  });

  /** `draft: true` is frontmatter the schema declares, so hiding it is a filter, not a convention. */
  it('keeps a draft out of the index, the routes and llms.txt', async () => {
    const html = await (await get('/')).text();
    const llms = await (await get('/llms.txt')).text();

    expect(html).not.toContain(DRAFT);
    expect(llms).not.toContain(DRAFT);
    expect((await get(`/notes/${DRAFT}`)).status).toBe(404);
  });

  it('renders typed frontmatter into the page, not a regex guess at the body', async () => {
    const html = await (await get('/notes/typed-frontmatter')).text();

    expect(html).toContain('<title>Frontmatter the framework validates — Janux content collections</title>');
    expect(html).toContain('name="description" id="jx-description" content="One schema() checks a post');
    expect(html).toContain('<time dateTime="2026-07-04">');
    expect(html).toContain('class="tag">schema</span>');
  });

  it('renders the markdown body with heading ids and builds the TOC from the same ids', async () => {
    const html = await (await get('/notes/typed-frontmatter')).text();

    expect(html).toContain('<h2 id="one-schema-two-surfaces"');
    expect(html).toContain('href="#one-schema-two-surfaces"');
  });

  it('enumerates only the published notes through listPages', async () => {
    expect((await server.listPages()).sort()).toEqual(['/', ...PUBLISHED.map((slug) => `/notes/${slug}`)].sort());
  });
});

describe('examples/with-content MDX', () => {
  it('mounts a Janux component written in the content as a real island', async () => {
    const html = await (await get('/notes/interactive-content')).text();

    expect(html).toContain('data-jx="poll#');
    // Server-rendered, not a placeholder waiting for hydration.
    expect(html).toContain('Resumability');
  });

  /** The island came from a markdown file, and it is on the agent surface all the same. */
  it('exposes the content island intents on the manifest', async () => {
    const manifest = await (await get('/_janux/manifest?path=/notes/interactive-content')).json();
    const poll = manifest.resources?.find((entry: any) => entry.uri?.startsWith('ui://poll'));

    expect(poll).toBeDefined();
    expect(manifest.tools.map((tool: any) => tool.name)).toContain('poll.vote');
  });

  it('mounts a React component from the content, server-rendered, via foreign()', async () => {
    const html = await (await get('/notes/charting-with-react')).text();

    expect(html).toContain('janux-foreign');
    expect(html).toContain('<svg class="trend"');
    expect(html).toContain('<polyline');
  });

  /** A `.md` file is markdown: `{braces}` and raw HTML are what the author wrote. */
  it('does not read a markdown body as JSX', async () => {
    const html = await (await get('/notes/agent-readable-content')).text();

    expect(html).toContain('{ title, date, tags }');
    expect(html).toContain('<figure class="callout">');
  });
});

describe('examples/with-content agent face', () => {
  it('serves any note as markdown through the .md projection', async () => {
    const response = await get('/notes/typed-frontmatter.md');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(body).toContain('## One schema, two surfaces');
  });

  it('projects an MDX note, island included, as markdown', async () => {
    const body = await (await get('/notes/interactive-content.md')).text();

    expect(body).toContain('Resumability');
  });

  it('serves llms.txt with the concrete note pages', async () => {
    const body = await (await get('/llms.txt')).text();

    PUBLISHED.forEach((slug) => expect(body).toContain(`- [/notes/${slug}](/notes/${slug})`));
  });
});

describe.skipIf(!isBuilt(APP))('examples/with-content static build', () => {
  it('prerenders one html file per published note', () => {
    PUBLISHED.forEach((slug) => expect(distPage(`/notes/${slug}`)).toContain('<h1'));
    expect(existsSync(join(DIST, `notes/${DRAFT}/index.html`))).toBe(false);
  });

  /**
   * The whole constraint in one assertion: MDX is compiled on the server, so a
   * page of prose is still a file with no scripts in it.
   */
  it('ships zero JavaScript on a note with no components in it', () => {
    const html = distPage('/notes/typed-frontmatter');

    expect(html).not.toContain('client.js');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('type="module"');
  });

  it('ships the runtime only on the notes that embed a component', () => {
    expect(distPage('/notes/interactive-content')).toContain('client.js');
    expect(distPage('/notes/charting-with-react')).toContain('client.js');
  });

  /** 0 KB stays 0 KB only if the compiler never reaches the browser bundle. */
  it('keeps the MDX compiler out of the client bundle', () => {
    const bundle = readFileSync(join(DIST, 'client.js'), 'utf8');

    expect(bundle).not.toContain('@mdx-js');
    expect(bundle).not.toContain('micromark');
  });

  it('emits the .md projection and llms.txt beside the pages', () => {
    expect(readFileSync(join(DIST, 'notes/typed-frontmatter.md'), 'utf8')).toContain('## One schema, two surfaces');
    expect(readFileSync(join(DIST, 'llms.txt'), 'utf8')).toContain('/notes/interactive-content');
    expect(existsSync(join(DIST, '404.html'))).toBe(true);
  });
});

describe.skipIf(!isBuilt(APP))('examples/with-content in a browser', () => {
  let built: Awaited<ReturnType<typeof serveBuilt>>;

  beforeAll(async () => {
    built = await serveBuilt(APP);
  });
  afterAll(() => built?.stop());

  it(
    'an island written inside MDX resumes and responds to a click',
    async () => {
      const { page, errors } = await openPage(await launchChrome());

      await page.goto(`${built.base}/notes/interactive-content`);
      await page.click('button[data-jxa="poll#default:vote"]');
      await page.waitForFunction(() => document.querySelector('.poll-total')?.textContent?.includes('1 vote'));

      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});
