import { describe, expect, it } from 'bun:test';
import { jsx } from 'janux';
import { createJanuxServer } from './server';
import { discoverSkills, parseSkill, skillIndex } from './skills';

const SKILLS = `${import.meta.dirname}/__fixtures__/skills`;

const toPosix = (path: string) => path.replaceAll('\\', '/');

describe('skills — the filesystem convention', () => {
  it('discovers flat markdown and SKILL.md packages, sorted by name', () => {
    const skills = discoverSkills(SKILLS);

    expect(skills.map((skill) => skill.name)).toEqual(['refund-order', 'warehouse-audit']);
  });

  it('derives the name from the file when frontmatter omits it, and honours it when present', () => {
    const skills = discoverSkills(SKILLS);

    // Compared in posix form: `join` answers with backslashes on Windows.
    expect(toPosix(skills[0]!.file).endsWith('__fixtures__/skills/refund-order.md')).toBe(true);
    expect(toPosix(skills[1]!.file).endsWith('__fixtures__/skills/stock-audit/SKILL.md')).toBe(true);
  });

  it('keeps the body out of the index — that is the whole point of loading on demand', () => {
    const index = skillIndex(discoverSkills(SKILLS));

    expect(index[0]).toEqual({
      name: 'refund-order',
      description: 'Refund an order end to end, including the restock the policy requires.',
      when: 'The customer asks for a refund, a return or their money back.',
      tools: ['api.orders.find', 'orders.refund'],
    });
    expect(JSON.stringify(index)).not.toContain('Find the order');
  });

  it('answers nothing for a directory that does not exist', () => {
    expect(discoverSkills(`${SKILLS}/nope`)).toEqual([]);
  });

  it('parses frontmatter and keeps the markdown body verbatim', () => {
    const skill = parseSkill('---\ndescription: Do a thing\n---\n\n# Title\n\nBody.\n', 'do-thing');

    expect(skill).toMatchObject({ name: 'do-thing', description: 'Do a thing', tools: [] });
    expect(skill.body).toBe('# Title\n\nBody.\n');
  });

  it('refuses a skill with no description — an index entry nobody can route on', () => {
    expect(() => parseSkill('---\nwhen: always\n---\nbody', 'nameless')).toThrow(/description/);
  });

  it('refuses a skill with no frontmatter at all', () => {
    expect(() => parseSkill('# Just prose', 'bare')).toThrow(/frontmatter/);
  });

  it('names the skill in the error so a broken file is findable', () => {
    expect(() => parseSkill('---\ntools: yes\ndescription: x\n---\nb', 'bad-tools')).toThrow(/bad-tools/);
  });
});

describe('skills — projected into the manifest', () => {
  function server() {
    return createJanuxServer({
      routes: { '/': () => jsx('main', { children: 'home' }) },
      skills: discoverSkills(SKILLS),
    });
  }

  it('every route manifest carries the index, so the model always knows what exists', async () => {
    const manifest = (await server().manifestFor('/', {})) as any;

    expect(manifest.skills.map((skill: any) => skill.name)).toEqual(['refund-order', 'warehouse-audit']);
  });

  it('the manifest never carries a body — that is what loading on demand means', async () => {
    const manifest = (await server().manifestFor('/', {})) as any;

    expect(JSON.stringify(manifest)).not.toContain('Find the order');
  });

  it('omits `skills` entirely for an app that declares none', async () => {
    const bare = createJanuxServer({ routes: { '/': () => jsx('main', { children: 'home' }) } });

    expect((await bare.manifestFor('/', {})) as any).not.toHaveProperty('skills');
  });
});
