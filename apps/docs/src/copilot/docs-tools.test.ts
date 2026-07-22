import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { registry } from '@janux/agent/local';
import { registerDocsTools } from './docs-tools';

const CORPUS = [
  {
    section: 'guide',
    slug: 'components',
    title: 'Components',
    headings: [{ id: 'islands', text: 'Islands' }],
    text: 'A component is simultaneously a view and a set of tools. Islands resume lazily.',
  },
  {
    section: 'recipes',
    slug: 'tailwind',
    title: 'Tailwind',
    headings: [],
    text: 'Style Janux apps with Tailwind.',
  },
];

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async () => Response.json(CORPUS)) as any;
  registerDocsTools();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  registry.clear();
});

async function toolText(name: string, input: Record<string, unknown>): Promise<any> {
  const envelope = await registry.get(name)!.execute(input);

  return JSON.parse(envelope.content[0]!.text);
}

describe('docs copilot tools', () => {
  it('registers both grounding tools as read-only', () => {
    expect(registry.get('search_docs')?.annotations.readOnlyHint).toBe(true);
    expect(registry.get('read_doc')?.annotations.readOnlyHint).toBe(true);
  });

  it('search_docs returns ranked matches with paths', async () => {
    const { matches } = await toolText('search_docs', { query: 'islands' });

    expect(matches).toHaveLength(1);
    expect(matches[0].path).toBe('/docs/guide/components');
    expect(matches[0].title).toBe('Components');
  });

  it('read_doc returns the page text for a valid path', async () => {
    const page = await toolText('read_doc', { path: '/docs/recipes/tailwind' });

    expect(page.text).toContain('Tailwind');
  });

  it('search_docs survives question-shaped queries (stopwords + punctuation)', async () => {
    const { matches } = await toolText('search_docs', { query: 'How do I use islands in a component?' });

    expect(matches[0].path).toBe('/docs/guide/components');
  });

  it('read_doc guides the model on unknown paths', async () => {
    const page = await toolText('read_doc', { path: '/docs/nope/missing' });

    expect(page.error).toContain('search_docs');
  });

});
