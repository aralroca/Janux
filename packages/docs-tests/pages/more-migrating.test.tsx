import { describe, expect, it } from 'bun:test';
import { createInstance, validate } from 'janux';
import { docExample } from '../doc-example';

/**
 * more/migrating-from-next.md and more/migrating-from-astro.md.
 *
 * A migration guide is the one kind of page a reader cannot sanity-check
 * against their own app: they are following it *because* they do not know the
 * target framework yet. So every snippet that claims "this is the Janux
 * equivalent" is executed here, against the real runtime — a guide that
 * promises a shape the framework does not have costs more users than it wins.
 */

describe('more/migrating-from-next.md — metadata', () => {
  it('the translated `meta` export is the shape the page claims', async () => {
    const { meta } = await docExample('apps/docs/content/more/migrating-from-next.md');

    expect(meta.title).toBe('The blog');
    // The two un-nestings the page documents: alternates.canonical → canonical,
    // openGraph.images[0] → og.image.
    expect(meta.canonical).toBe('/blog');
    expect(meta.og).toEqual({ type: 'article', image: '/og.png' });
    expect(meta).not.toHaveProperty('metadataBase');
  });

  it('`meta` as a function resolves against the params, as generateMetadata did', async () => {
    const { meta } = await docExample('apps/docs/content/more/migrating-from-next.md', 1);

    expect(typeof meta).toBe('function');
    expect(await meta({ params: { slug: 'hello' } })).toEqual({ title: 'hello' });
  });
});

describe('more/migrating-from-next.md — the island that replaces a client component', () => {
  it('holds schema-typed state and moves it through the named intent', async () => {
    const { Counter } = await docExample('apps/docs/content/more/migrating-from-next.md', 3);
    const counter = createInstance(Counter);

    await counter.attach();
    expect(counter.snapshot().count).toBe(0);

    await counter.intents.add();

    expect(counter.snapshot().count).toBe(1);
  });

  it('is an agent surface as well as a UI — the claim the extra lines are there for', async () => {
    const { Counter } = await docExample('apps/docs/content/more/migrating-from-next.md', 3);
    const counter = createInstance(Counter);

    await counter.attach();

    // Called the way an agent reaches it, not the way the button does.
    await counter.intents.add(undefined, { origin: 'agent' });

    expect(counter.snapshot().count).toBe(1);
    expect(Counter.intents.add.description).toBe('Increment the counter');
  });
});

describe('more/migrating-from-astro.md — content collections', () => {
  it('the translated collection carries the Janux schema, with the modifiers unchanged', async () => {
    const { blog } = await docExample('apps/docs/content/more/migrating-from-astro.md');
    const frontmatter = validate(blog.schema, { title: 'A post', tags: ['janux'] });

    expect(frontmatter.ok).toBe(true);
    // `.default(false)` and `.optional()` mean on this side exactly what they meant on the other.
    expect(frontmatter.value.draft).toBe(false);
    expect(frontmatter.value.description).toBeUndefined();
  });

  it('rejects frontmatter the schema does not describe, which is the point of porting it', async () => {
    const { blog } = await docExample('apps/docs/content/more/migrating-from-astro.md');

    expect(validate(blog.schema, { tags: [] }).ok).toBe(false);
  });
});

describe('more/migrating-from-astro.md — the island that replaces a client:* directive', () => {
  it('sets its state through the intent an agent can also call', async () => {
    const { Search } = await docExample('apps/docs/content/more/migrating-from-astro.md', 1);
    const search = createInstance(Search);

    await search.attach();
    await search.intents.setQuery({ query: 'islands' });

    expect(search.snapshot().query).toBe('islands');
  });
});
