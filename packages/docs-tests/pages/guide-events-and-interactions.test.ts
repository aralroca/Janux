import { describe, expect, it } from 'bun:test';
import { component, createInstance, intent, jsx, renderToString, schema, str } from 'janux';

/**
 * The claims guide/events-and-interactions.md makes, asserted: the "any event,
 * one rule" marker table, `.with()` rendering `data-input`, the reserved on*
 * namespace, and the human-vs-agent origin section.
 */

const Gallery = component({
  name: 'gallery',
  description: 'A product gallery',
  state: schema({ last: str().default(''), savedBy: str().default('') }),
  intents: {
    add: intent({
      description: 'Add a product',
      input: schema({ productId: str() }),
      run: ({ state, input }: any) => (state.last = input.productId),
    }),
    open: intent({ description: 'Open a shot', run: () => {} }),
    save: intent({
      description: 'Persist the draft',
      guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'),
      run: ({ state, origin }: any) => (state.savedBy = origin),
    }),
  },
  view: ({ intents }: any) =>
    jsx('div', {
      children: [
        jsx('button', { class: 'add', onClick: intents.add.with({ productId: 'p1' }) }),
        jsx('figure', { onDoubleClick: intents.open }),
        jsx('section', { onMouseEnter: intents.open, onWheel: intents.open }),
        jsx('form', { onSubmit: intents.save }),
      ],
    }),
});

describe('guide/events-and-interactions.md', () => {
  it('any event, one rule: onClick→data-jxa, onSubmit→data-jxform, the rest→data-jxe-*', async () => {
    const { html } = await renderToString(jsx(Gallery as any, {}), {});

    expect(html).toContain('data-jxa="gallery#default:add"');
    expect(html).toContain('data-jxform="gallery#default:save"');
    expect(html).toContain('data-jxe-dblclick="gallery#default:open"');
    expect(html).toContain('data-jxe-mouseenter="gallery#default:open"');
    expect(html).toContain('data-jxe-wheel="gallery#default:open"');
  });

  it('.with() serializes the bound input to the control data-input', async () => {
    const { html } = await renderToString(jsx(Gallery as any, {}), {});

    expect(html).toContain('data-input="{&quot;productId&quot;:&quot;p1&quot;}"');
  });

  it('the on* namespace never renders a closure or an inline handler string', async () => {
    const { html } = await renderToString(
      jsx('div', { onClick: () => {}, onwheel: 'spin()', children: 'x' }),
      {},
    );

    expect(html).toBe('<div>x</div>');
  });

  it('run() sees the origin, and the origin-aware guard proposes only for agents', async () => {
    let proposal: any;
    const instance = createInstance(Gallery, { onProposal: (p) => (proposal = p) });

    await instance.attach();
    await instance.intents.save({});
    expect(instance.snapshot().savedBy).toBe('human');

    const result: any = await instance.intents.save({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    await proposal.execute();
    expect(instance.snapshot().savedBy).toBe('agent');
  });
});
