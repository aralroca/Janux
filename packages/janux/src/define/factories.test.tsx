/** @jsxImportSource .. */
import { describe, expect, it } from 'bun:test';

import { component } from './factories';
import { renderToString } from '../render/server';

const Island = component({
  name: 'tag-island',
  view: () => <p>hello</p>,
});

describe('component() as a JSX tag', () => {
  it('typechecks as an element and server-renders as an island', async () => {
    const page = (
      <main>
        <Island eager />
      </main>
    );
    const result = await renderToString(page);

    expect(result.html).toContain('data-jx="tag-island#');
    expect(result.html).toContain('data-jx-eager');
    expect(result.html).toContain('<p>hello</p>');
  });
});
