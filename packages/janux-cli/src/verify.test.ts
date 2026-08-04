import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str } from 'janux';
import { api, createJanuxServer, parseSkill } from '@janux/server';
import { auditAgentCard, auditManifest, auditSkills, collectFindings, knownTools } from './verify';

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

/**
 * The differential claim: elsewhere a skill is prose, so it may name a tool
 * that does not exist and nobody finds out until a model tries it. Here the
 * tools are derived from the mounted tree, so the same check the manifest
 * already enables can be run against the procedure.
 */
describe('auditSkills', () => {
  const tools = new Set(['api.shop.described', 'bare-cart.add', 'ui_navigate']);
  const skill = (body: string, front = 'description: A procedure') =>
    parseSkill(`---\n${front}\n---\n${body}`, 'checkout', '/app/src/skills/checkout.md');

  it('passes a skill whose declared and mentioned tools all exist', () => {
    const findings = auditSkills([skill('Add with `bare-cart.add`, then `ui_navigate`.', 'description: x\ntools: [api.shop.described]')], tools);

    expect(findings).toEqual([]);
  });

  it('errors on a declared tool that does not exist', () => {
    const findings = auditSkills([skill('body', 'description: x\ntools: [api.shop.invented]')], tools);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe('error');
    expect(findings[0]!.tool).toBe('api.shop.invented');
    expect(findings[0]!.message).toContain('src/skills/checkout.md');
  });

  it('errors on a tool the body names in a namespace the app really has', () => {
    const findings = auditSkills([skill('Then call `bare-cart.remove` to undo it.')], tools);

    expect(findings.map((finding) => finding.tool)).toEqual(['bare-cart.remove']);
  });

  it('errors on an invented client tool, which is a closed set', () => {
    const findings = auditSkills([skill('Use `ui_teleport` to get there.')], tools);

    expect(findings.map((finding) => finding.tool)).toEqual(['ui_teleport']);
  });

  it('leaves prose that merely looks dotted alone — filenames, config, host APIs', () => {
    const body = 'Edit `janux.config.ts`, read `import.meta.url`, see `docs/guide.md`.';

    expect(auditSkills([skill(body)], tools)).toEqual([]);
  });

  it('reads the worked example too, which is where a model copies a name from', () => {
    const body = ['Follow this:', '', '```', 'bare-cart.add      { "sku": "MUG" }', 'bare-cart.checkuot {}', '```'].join('\n');

    expect(auditSkills([skill(body)], tools).map((finding) => finding.tool)).toEqual(['bare-cart.checkuot']);
  });

  it('reports each unknown tool once, however often the skill repeats it', () => {
    const findings = auditSkills([skill('`bare-cart.remove` then `bare-cart.remove` again.')], tools);

    expect(findings).toHaveLength(1);
  });

  it('names the skill, so a red build says which file to open', () => {
    const findings = auditSkills([skill('body', 'description: x\ntools: [nope.nope]')], tools);

    expect(findings[0]!.tool).toBe('nope.nope');
    expect(findings[0]!.message).toContain('checkout');
  });
});

describe('a tool list nobody could complete', () => {
  const lying = parseSkill('---\ndescription: x\ntools: [gone.missing]\n---\nbody', 'checkout');

  it('renders what it can: a route that explodes contributes nothing rather than throwing', async () => {
    const names = await knownTools(['/shop', '/boom'], manifestFor);

    expect(names.has('bare-cart.add')).toBe(true);
  });

  it('warns instead of failing when a route did not render — the short list is not the skill\'s fault', () => {
    const findings = auditSkills([lying], new Set(['bare-cart.add']), false);

    expect(findings[0]!.level).toBe('warn');
    expect(findings[0]!.message).toContain('tool list is incomplete');
  });

  it('still fails the build when every route rendered', () => {
    expect(auditSkills([lying], new Set(['bare-cart.add']))[0]!.level).toBe('error');
  });
});

/**
 * The A2A surface: the card is derived, so what `janux verify` can still catch
 * is the day it stops being — a skill the app no longer has, and a description
 * an outside agent would read as the whole documentation of a tool.
 */
describe('auditAgentCard', () => {
  const tools = new Set(['api.shop.described', 'bare-cart.add']);
  const card = (skills: { id: string; description: string; tags: string[] }[]) => ({ skills });

  it('passes a card whose tool skills all exist and are described', () => {
    expect(auditAgentCard(card([{ id: 'shop.described', description: 'Search things', tags: ['tool', 'auto'] }]), tools)).toEqual([]);
  });

  it('errors on an advertised tool the app does not have', () => {
    const findings = auditAgentCard(card([{ id: 'shop.invented', description: 'x', tags: ['tool', 'auto'] }]), tools);

    expect(findings[0]).toEqual({
      level: 'error',
      tool: 'shop.invented',
      message: 'the agent card advertises a tool this app does not have — the card is not derived from the app',
    });
  });

  it('errors on a tool advertised to outside agents with no description at all', () => {
    const findings = auditAgentCard(card([{ id: 'shop.described', description: '', tags: ['tool', 'auto'] }]), tools);

    expect(findings[0]!.message).toContain('missing description');
  });

  it('leaves procedure skills to the skill audit, which reads their bodies', () => {
    expect(auditAgentCard(card([{ id: 'skill:refund', description: 'How to refund.', tags: ['procedure'] }]), tools)).toEqual([]);
  });
});

describe('knownTools', () => {
  it('unions every route manifest with the client tools an agent always has', async () => {
    const names = await knownTools(['/', '/shop'], manifestFor);

    expect(names.has('api.shop.described')).toBe(true);
    expect(names.has('bare-cart.add')).toBe(true);
    expect(names.has('ui_navigate')).toBe(true);
  });

  it('leaves out what the agent may not reach, so a skill cannot point at it', async () => {
    const names = await knownTools(['/'], manifestFor);

    expect(names.has('api.shop.hidden')).toBe(false);
  });
});
