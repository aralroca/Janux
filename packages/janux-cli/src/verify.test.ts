import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { auditManifest, collectFindings } from './verify';

const apis = {
  described: api({
    description: 'Search things',
    input: schema({ q: str() }),
    run: ({ input }) => [input.q],
  }),
  undescribed: api({ guard: 'confirm', run: () => 'paid' }),
  hidden: api({ guard: 'forbidden', run: () => 'secret' }),
};

const bareCart = component({
  name: 'bare-cart',
  state: schema({ items: str() }),
  intents: { add: intent({ run: () => undefined }) },
  view: () => jsx('p', { children: 'cart' }),
});

const server = createJanuxServer({
  routes: {
    '/': () => jsx('main', {}),
    '/shop': () => jsx('div', { children: jsx(bareCart as any, {}) }),
    '/boom': () => {
      throw new Error('render exploded');
    },
  },
  apis: { shop: apis },
});

const manifestFor = (path: string) => server.manifestFor(path, {});

describe('auditManifest', () => {
  it('flags agent-reachable tools without description', () => {
    const findings = auditManifest({
      tools: [
        { name: 'a.ok', description: 'fine', guard: 'auto' },
        { name: 'a.bad', guard: 'confirm' },
      ],
    });

    expect(findings).toEqual([
      { level: 'error', tool: 'a.bad', message: 'missing description (agent-reachable, guard "confirm")' },
    ]);
  });
});

describe('collectFindings', () => {
  it('errors on undescribed api tools and intents, once across routes', async () => {
    const findings = await collectFindings(['/', '/shop'], manifestFor);
    const tools = findings.map((finding) => finding.tool);

    expect(tools).toContain('api.shop.undescribed');
    expect(tools).toContain('bare-cart.add');
    expect(tools.filter((tool) => tool === 'api.shop.undescribed')).toHaveLength(1);
  });

  it('never flags forbidden tools (not agent-reachable)', async () => {
    const findings = await collectFindings(['/'], manifestFor);

    expect(findings.map((finding) => finding.tool)).not.toContain('api.shop.hidden');
  });

  it('warns when a route fails to render', async () => {
    const findings = await collectFindings(['/boom'], manifestFor);

    expect(findings[0]?.level).toBe('warn');
    expect(findings[0]?.message).toContain('/boom');
    expect(findings[0]?.message).toContain('render exploded');
  });
});
