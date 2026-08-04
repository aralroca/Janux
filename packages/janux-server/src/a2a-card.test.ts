import { describe, expect, it } from 'bun:test';
import { int, schema, str } from 'janux';
import { api, type ApiTool } from './api';
import { agentCard, A2A_PROTOCOL_VERSION, TOOL_INVOCATION_EXTENSION } from './a2a-card';
import type { Skill } from './skills';

const tool = (name: string, def: Record<string, unknown>): ApiTool => ({ ...(api({ run: () => 1, ...def } as any) as any), name });

const READ = { tool: tool('shop.read', { description: 'Read it', input: schema({ q: str() }) }), guard: 'auto' as const };
const PAY = { tool: tool('shop.pay', { description: 'Pay', input: schema({ amount: int() }) }), guard: 'confirm' as const };
const BARE = { tool: tool('shop.bare', {}), guard: 'auto' as const };

const REFUND: Skill = {
  name: 'refund',
  description: 'How a refund is issued end to end.',
  when: 'A customer asks for their money back.',
  tools: ['shop.pay'],
  body: '# Refund\n\nAsk, then pay.',
  file: '/app/src/skills/refund.md',
};

const card = (overrides: Partial<Parameters<typeof agentCard>[0]> = {}) =>
  agentCard({
    name: 'Shop App',
    endpoint: 'https://shop.test/_janux/a2a',
    tools: [READ, PAY, BARE],
    skills: [REFUND],
    auth: false,
    ...overrides,
  });

describe('agentCard', () => {
  it('names the agent after the app and describes it when the app does not', () => {
    expect(card()).toMatchObject({ name: 'Shop App', description: 'The agent surface of Shop App.', version: '1' });
  });

  it('prefers the description the app already wrote for llms.txt', () => {
    expect(card({ description: 'A demo shop.' }).description).toBe('A demo shop.');
  });

  it('advertises the endpoint as a JSON-RPC interface at the current protocol version', () => {
    expect(card().supportedInterfaces).toEqual([
      { url: 'https://shop.test/_janux/a2a', protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION },
    ]);
  });

  it('claims only the capabilities a stateless endpoint really has', () => {
    const { streaming, pushNotifications, extendedAgentCard } = card().capabilities;

    expect({ streaming, pushNotifications, extendedAgentCard }).toEqual({
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    });
  });

  it('exchanges structured data only, in both directions', () => {
    expect([card().defaultInputModes, card().defaultOutputModes]).toEqual([['application/json'], ['application/json']]);
  });

  it('projects every callable tool as a skill under its wire name', () => {
    expect(card().skills.map((skill) => skill.id)).toEqual(['shop.read', 'shop.pay', 'shop.bare', 'skill:refund']);
  });

  it('carries each tool description and its guard as a tag', () => {
    expect(card().skills[1]).toEqual({
      id: 'shop.pay',
      name: 'shop.pay',
      description: 'Pay',
      tags: ['tool', 'confirm'],
    });
  });

  it('advertises a tool with no description as having none rather than inventing one', () => {
    expect(card().skills[2]!.description).toBe('');
  });

  it('projects a skill as a procedure, with its `when` as the example', () => {
    expect(card().skills[3]).toEqual({
      id: 'skill:refund',
      name: 'refund',
      description: 'How a refund is issued end to end.',
      tags: ['procedure'],
      examples: ['A customer asks for their money back.'],
    });
  });

  it('omits examples for a skill that declares no `when`', () => {
    const [procedure] = card({ tools: [], skills: [{ ...REFUND, when: undefined }] }).skills;

    expect('examples' in procedure!).toBe(false);
  });

  it('declares how a skill is invoked, with each tool input schema, as a protocol extension', () => {
    const [extension] = card().capabilities.extensions!;

    expect(extension!.uri).toBe(TOOL_INVOCATION_EXTENSION);
    expect(extension!.required).toBe(true);
    expect(extension!.params.schemas).toEqual({
      'shop.read': { type: 'object', properties: { q: { type: 'string' } }, required: ['q'], additionalProperties: false },
      'shop.pay': { type: 'object', properties: { amount: { type: 'integer' } }, required: ['amount'], additionalProperties: false },
      'shop.bare': { type: 'object', properties: {} },
    });
  });

  it('says how to invoke a skill in the extension description, so a client needs no other page', () => {
    expect(card().capabilities.extensions![0]!.description).toContain('"skill"');
    expect(card().capabilities.extensions![0]!.description).toContain('"input"');
  });

  it('an open endpoint declares no security scheme', () => {
    expect('securitySchemes' in card()).toBe(false);
  });

  it('a bearer-protected endpoint declares the scheme it answers 401 with', () => {
    expect(card({ auth: true }).securitySchemes).toEqual({
      bearer: { httpAuthSecurityScheme: { scheme: 'Bearer', description: 'The same bearer token the MCP endpoint requires.' } },
    });
  });

  it('an app with nothing to offer still emits a valid card', () => {
    const empty = card({ tools: [], skills: [] });

    expect(empty.skills).toEqual([]);
    expect(empty.capabilities.extensions![0]!.params.schemas).toEqual({});
  });
});
