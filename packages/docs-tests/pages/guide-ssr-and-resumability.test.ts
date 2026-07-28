import { describe, expect, it } from 'bun:test';
import { component, jsx, renderToStream, renderToString, source } from 'janux';

/**
 * guide/ssr-and-resumability.md's suspense and error boundary claims, run for
 * real: the fallback streams while the page keeps going, the content swaps in
 * a trailing template, cache hits inline, and a throw routes to the nearest
 * `error` view instead of killing the page.
 */

const drain = async (page: unknown) => {
  const { chunks } = renderToStream(page);
  const collected: string[] = [];

  for await (const chunk of chunks) collected.push(chunk);

  return collected.join('');
};

describe('guide/ssr-and-resumability.md', () => {
  // The SlowStats shape the page shows: a deliberately slow source + suspense.
  it('streams the fallback in place and the content in a trailing template', async () => {
    let release!: (stats: string[]) => void;
    const fetchStats = () => new Promise<string[]>((resolve) => { release = resolve; });
    const SlowStats = component({
      name: 'slow-stats',
      sources: { stats: source({ query: () => fetchStats() }) },
      suspense: () => jsx('p', { class: 'skeleton', children: 'Loading stats…' }),
      view: ({ sources }) => jsx('p', { children: `${sources.stats.value.length} stats` }),
    });
    const { chunks } = renderToStream(jsx('main', { children: jsx(SlowStats as any, {}) }));
    const collected: string[] = [];
    const drained = (async () => {
      for await (const chunk of chunks) collected.push(chunk);
    })();

    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve));
    expect(collected.join('')).toContain('data-jx-pending><p class="skeleton">Loading stats…</p>');

    release(['a', 'b']);
    await drained;
    expect(collected.join('')).toContain('<template id="jxu:slow-stats#default"');
    expect(collected.join('')).toContain('2 stats');
  });

  it('a source that settles immediately is inlined: no boundary at all', async () => {
    const Cached = component({
      name: 'cached',
      sources: { stats: source({ query: async () => ['a'] }) },
      suspense: () => jsx('p', { children: 'never shown' }),
      view: ({ sources }) => jsx('p', { children: `${sources.stats.value.length} stats` }),
    });
    const html = await drain(jsx(Cached as any, {}));

    expect(html).toContain('1 stats');
    expect(html).not.toContain('data-jx-pending');
    expect(html).not.toContain('<template');
  });

  // The Report shape the page shows: a throwing view with its own error view.
  it('a throw renders the error view and the rest of the page never notices', async () => {
    const Report = component({
      name: 'report',
      error: ({ error }) => jsx('p', { class: 'error', children: `Report failed: ${String(error)}` }),
      view: () => {
        throw new Error('the data was corrupt');
      },
    });
    const { html } = await renderToString(
      jsx('main', { children: [jsx(Report as any, {}), jsx('h1', { children: 'alive' })] }),
    );

    expect(html).toContain('Report failed: Error: the data was corrupt');
    expect(html).toContain('<h1>alive</h1>');
  });

  it('a nested island without an error view bubbles to the closest ancestor boundary', async () => {
    const Leaf = component({
      name: 'leaf',
      view: () => {
        throw new Error('leaf exploded');
      },
    });
    const Shell = component({
      name: 'shell',
      error: ({ error }) => jsx('p', { children: `caught: ${(error as Error).message}` }),
      view: () => jsx('section', { children: jsx(Leaf as any, {}) }),
    });
    const { html } = await renderToString(jsx(Shell as any, {}));

    expect(html).toContain('caught: leaf exploded');
  });

  it('with no boundary anywhere, the island fails soft and the page survives', async () => {
    const Broken = component({
      name: 'broken',
      view: () => {
        throw new Error('no boundary');
      },
    });
    const { html } = await renderToString(
      jsx('main', { children: [jsx(Broken as any, {}), jsx('h1', { children: 'alive' })] }),
    );

    expect(html).toContain('janux:error');
    expect(html).toContain('<h1>alive</h1>');
  });
});
