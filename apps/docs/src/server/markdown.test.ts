import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  test('TOC entries decode HTML entities and strip inline tags', async () => {
    const { toc } = await renderMarkdown('# Title\n\n## Requirements & gotchas\n\n## The `code` case');

    expect(toc.map((entry) => entry.text)).toEqual(['Requirements & gotchas', 'The code case']);
    expect(toc.map((entry) => entry.id)).toEqual(['requirements-gotchas', 'the-code-case']);
  });

  test('headings render ids and anchors', async () => {
    const { html } = await renderMarkdown('## Ship & deploy');

    expect(html).toContain('<h2 id="ship-deploy">');
    expect(html).toContain('href="#ship-deploy"');
  });
});
