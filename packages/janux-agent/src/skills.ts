import type { ManifestSkill } from 'janux/manifest';
import type { AgentDeps } from '@janux/server';
import type { AgentTool } from './providers';

/**
 * Skills in the turn: an index the model always has, a body it asks for.
 *
 * The index comes from the manifest, so it is the same list `janux verify`
 * checked and MCP advertises — there is no second copy to drift. The body
 * arrives as an ordinary tool result, which is what makes the cost
 * proportional: a procedure nobody needs this turn costs one line.
 *
 * `load_skill` is a read. It returns markdown; it invokes nothing. The tools a
 * skill talks about are still called through the invocation pipeline, with the
 * guards they declare — a skill cannot grant itself a permission by describing
 * one.
 */

export const LOAD_SKILL = 'load_skill';

const PREAMBLE = [
  'Skills are the procedures this app documents for multi-step tasks.',
  `Call \`${LOAD_SKILL}\` with the name below when the request matches one, and follow the steps it returns.`,
  'Until you load it you have only the line below, never the procedure.',
].join(' ');

function skillLine(skill: ManifestSkill): string {
  return `- ${skill.name}: ${skill.description}${skill.when ? ` Use when: ${skill.when}` : ''}`;
}

/** The index block for the system prompt, or nothing for an app with no skills. */
export function skillsSection(skills: readonly ManifestSkill[]): string | undefined {
  if (skills.length === 0) return undefined;

  return [PREAMBLE, ...skills.map(skillLine)].join('\n');
}

/**
 * The `load_skill` spec, offered only when there is something to load. The
 * `enum` is the same index the prompt lists, so the one place a skill name is
 * declared is the one the schema accepts.
 */
export function loadSkillTools(skills: readonly ManifestSkill[]): AgentTool[] {
  if (skills.length === 0) return [];

  return [
    {
      name: LOAD_SKILL,
      description: 'Read the full procedure of one skill, by name. Returns markdown; it runs nothing.',
      input: {
        type: 'object',
        properties: { skill: { type: 'string', enum: skills.map((skill) => skill.name) } },
        required: ['skill'],
        additionalProperties: false,
      },
    },
  ];
}

/** The body, or an error that names what does exist — a wrong guess must be recoverable. */
export function loadSkillBody(input: unknown, skills: readonly ManifestSkill[], deps: AgentDeps): string {
  const name = (input as { skill?: unknown } | null)?.skill;
  const body = typeof name === 'string' ? deps.loadSkill?.(name) : undefined;

  if (body !== undefined) return body;

  throw new Error(`No skill named "${String(name)}". Available: ${skills.map((skill) => skill.name).join(', ')}.`);
}
