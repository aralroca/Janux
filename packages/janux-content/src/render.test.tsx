import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { component, schema, str } from 'janux';
import { renderToStream, renderToString } from 'janux/server';
import { defineCollection, getEntry } from './collection';
import { render } from './render';

const FIXTURES = join(import.meta.dir, '__fixtures__');
const POSTS = defineCollection({ dir: join(FIXTURES, 'content/posts'), schema: schema({ title: str(), date: str() }) });

const Counter = component({
  name: 'counter',
  state: schema({ label: str().default('hits') }),
  view: ({ state }) => <output class="counter">{state.label}</output>,
});

async function html(node: unknown): Promise<string> {
  const result = await renderToString(node as any);

  return typeof result === 'string' ? result : (result as { html: string }).html;
}

describe('render (markdown)', () => {
  it('renders a .md body to HTML', async () => {
    const { Content } = await render(getEntry(POSTS, 'hello')!);

    expect(await html(<Content />)).toContain('<h1');
    expect(await html(<Content />)).toContain('First post.');
  });

  /**
   * `.md` is markdown, not MDX: braces and angle brackets are prose. Compiling
   * every file as MDX would turn `{value}` in a paragraph into an expression
   * and fail an existing corpus on content it has always been allowed to write.
   */
  it('treats braces and unknown tags in .md as text', async () => {
    const entry = { ...getEntry(POSTS, 'hello')!, body: 'Use {count} and <Widget> literally.\n' };
    const { Content } = await render(entry);

    expect(await html(<Content />)).toContain('{count}');
  });

  it('keeps raw HTML written in a .md body', async () => {
    const entry = { ...getEntry(POSTS, 'hello')!, body: '<figure class="wide">\n\nCaption.\n\n</figure>\n' };
    const { Content } = await render(entry);

    expect(await html(<Content />)).toContain('<figure class="wide">');
  });

  it('collects headings with a slugged id, and puts the id on the element', async () => {
    const entry = { ...getEntry(POSTS, 'hello')!, body: '# Title\n\n## First section\n\n### Deep, with punctuation!\n' };
    const { Content, headings } = await render(entry);

    expect(headings).toEqual([
      { depth: 1, id: 'title', text: 'Title' },
      { depth: 2, id: 'first-section', text: 'First section' },
      { depth: 3, id: 'deep-with-punctuation', text: 'Deep, with punctuation!' },
    ]);
    expect(await html(<Content />)).toContain('id="first-section"');
  });
});

describe('render (mdx)', () => {
  it('mounts a Janux component as a real island', async () => {
    const { Content } = await render(getEntry(POSTS, 'interactive')!, { components: { Counter } });
    const output = await html(<Content />);

    expect(output).toContain('janux-island');
    expect(output).toContain('<output class="counter">hits</output>');
  });

  /** `initial` is the island contract for seeding state, and content uses it unchanged. */
  it('seeds island state from the content', async () => {
    const entry = { ...getEntry(POSTS, 'interactive')!, body: '<Counter initial={{ label: "reads" }} />\n' };
    const { Content } = await render(entry, { components: { Counter } });

    expect(await html(<Content />)).toContain('reads');
  });

  it('overrides an element with a component of the app\'s own', async () => {
    const entry = { ...getEntry(POSTS, 'interactive')!, body: '## Heading\n' };
    const { Content } = await render(entry, {
      components: { h2: (props: any) => <h2 class="doc-heading">{props.children}</h2> },
    });

    expect(await html(<Content />)).toContain('class="doc-heading"');
  });

  /** A typo in a component name must name the component, not render an empty page. */
  it('fails naming the component the content asked for', async () => {
    const entry = { ...getEntry(POSTS, 'interactive')!, body: '<Missing />\n' };
    const { Content } = await render(entry, { components: { Counter } });

    expect(html(<Content />)).rejects.toThrow(/Missing/);
  });

  it('reports the file when the content itself does not compile', async () => {
    const entry = { ...getEntry(POSTS, 'interactive')!, body: '<Counter\n' };

    expect(render(entry, { components: { Counter } })).rejects.toThrow(/interactive\.mdx/);
  });
});

describe('a collection rendered end to end', () => {
  /** The path a real page takes: read the entry, compile it, stream it out. */
  it('streams a post with an island in it', async () => {
    const entry = getEntry(POSTS, 'interactive')!;
    const { Content, headings } = await render(entry, { components: { Counter } });
    const stream = renderToStream(
      <article>
        <h1>{entry.data.title}</h1>
        <Content />
      </article>,
    );
    let streamed = '';

    for await (const chunk of stream.chunks) streamed += chunk;
    const { registry } = await stream.done;

    expect(streamed).toContain('<h1>Interactive</h1>');
    expect(streamed).toContain('<output class="counter">hits</output>');
    expect(registry.islands.map(({ def }) => def.name)).toEqual(['counter']);
    expect(headings.map((heading) => heading.text)).toEqual(['Interactive']);
  });
});

describe('the compiler stays on the server', () => {
  /**
   * Static content ships 0 KB, and it stays 0 KB only if the MDX compiler is
   * never reachable from a module the client graph can pull in. A static import
   * would put it in every app's dependency graph — including the ones that only
   * ever write `.md`.
   */
  it('imports @mdx-js/mdx dynamically, inside the render call', () => {
    const source = readFileSync(join(import.meta.dir, 'render.ts'), 'utf8');

    expect(source).not.toMatch(/^import[^\n]*'@mdx-js\/mdx'/m);
    expect(source).toMatch(/await import\('@mdx-js\/mdx'\)/);
  });
});
