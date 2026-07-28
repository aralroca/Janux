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

describe('component() suspense and error boundaries', () => {
  it('accepts suspense and error as def keys', () => {
    const def = component({
      name: 'bounded',
      suspense: () => <p>loading</p>,
      error: ({ error }) => <p>{String(error)}</p>,
      view: () => <p>ready</p>,
    });

    expect(typeof def.suspense).toBe('function');
    expect(typeof def.error).toBe('function');
  });

  it('rejects a suspense or error that is not a function', () => {
    expect(() => component({ name: 'x', suspense: 'nope' as any, view: () => null })).toThrow(
      'suspense',
    );
    expect(() => component({ name: 'x', error: 'nope' as any, view: () => null })).toThrow('error');
  });
});
