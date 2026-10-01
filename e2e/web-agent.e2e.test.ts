import { beforeAll, describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { planFor } from '../examples/with-web-agent/src/demo-plan';
import { createTestApp } from '@janux/testing';
import { appRoot } from './support/app';

let app: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  app = await createTestApp(appRoot('examples/with-web-agent'));
});

describe('examples/with-web-agent end to end', () => {
  it('renders the whole console server-side, before any JS runs', async () => {
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<title>Janux — web agent console</title>');
    ['Users', 'Team', 'Profile', 'Workflows', 'Board'].forEach((tab) => expect(html).toContain(`>${tab}<`));
    // Every panel ships mounted; CSS hides the inactive ones, so tab switches keep their state.
    expect(html).toContain('id="display-name"');
    expect(html).toContain('id="invite-send"');
    expect(html).toContain('Kenji Tanaka');
    // The board is plain HTML5 drag and drop: draggable cards, columns that take them.
    expect(html).toContain('Fix login redirect');
    expect(html).toContain('aria-dropeffect="move"');
    expect(html).toContain('id="assistant-panel"');
    // The chat form empties itself on submit through the runtime, not a DOM poke.
    expect(html).toContain('data-jxreset');
  });

  it('boots every island the console renders, so a delegated event can always resume it', () => {
    const src = path.resolve(import.meta.dir, '../examples/with-web-agent/src');
    const client = readFileSync(path.join(src, 'client.ts'), 'utf8');
    const booted = /defs:\s*\[([^\]]*)\]/.exec(client)![1]!.split(',').map((name) => name.trim());
    const islands = readdirSync(path.join(src, 'components'))
      .map((file) => readFileSync(path.join(src, 'components', file), 'utf8'))
      .flatMap((code) => [...code.matchAll(/export const (\w+) = component\(/g)].map((match) => match[1]!));

    expect(islands.filter((name) => !booted.includes(name))).toEqual([]);
  });

  it('exposes exactly the console it means to expose', async () => {
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards).toEqual({
      'console.goToTab': 'auto',
      'users.search': 'auto',
      'team.setEmail': 'auto',
      'team.setRole': 'auto',
      'team.invite': 'auto',
      'workflow.addStep': 'auto',
      'board.pick': 'auto',
      'board.dropOn': 'auto',
    });
    // `forbidden` intents are the app's own plumbing: the display name is only
    // reachable through the DOM fallback, and the copilot doesn't talk to itself.
    expect(Object.keys(guards)).not.toContain('profile.setDisplayName');
    expect(Object.keys(guards)).not.toContain('copilot.send');
    expect(manifest.resources.map((entry: any) => entry.uri)).toContain('ui://console');
  });

  it('advertises addStep with the label it needs and the workflow it starts from', async () => {
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const addStep = manifest.tools.find((tool: any) => tool.name === 'workflow.addStep');
    const workflow = manifest.resources.find((entry: any) => entry.uri.startsWith('ui://workflow'));

    expect(addStep.input.required).toEqual(['label']);
    expect(workflow).toBeDefined();
  });
});

/** The scripted planner is the demo's determinism: same request, same tour. */
describe('the demo planner', () => {
  it('opens the tab before acting on it, so the action is visible (and glows)', () => {
    expect(planFor('invite jane@acme.com as admin')).toEqual([
      { name: 'console_goToTab', arguments: { tab: 'team' } },
      { name: 'team_invite', arguments: { email: 'jane@acme.com', role: 'Admin' } },
    ]);
    expect(planFor('search Kenji')).toEqual([
      { name: 'console_goToTab', arguments: { tab: 'users' } },
      { name: 'users_search', arguments: { value: 'Kenji' } },
    ]);
  });

  it('falls back to the DOM for the display name, which no tool exposes', () => {
    expect(planFor('change my display name to Neo')).toEqual([
      { name: 'console_goToTab', arguments: { tab: 'profile' } },
      { name: 'read_page', arguments: {} },
      { name: 'fill', arguments: { ref: 'e?Display name', value: 'Neo' } },
    ]);
  });

  it('drags a card onto its column with the DOM fallback, as a hand would', () => {
    expect(planFor('move Fix login redirect to Done')).toEqual([
      { name: 'console_goToTab', arguments: { tab: 'board' } },
      { name: 'read_page', arguments: {} },
      { name: 'drag', arguments: { ref: 'e?Fix login redirect', to: 'e?Done' } },
    ]);
    expect(planFor('move "Write release notes" to in progress')[2]).toEqual({
      name: 'drag',
      arguments: { ref: 'e?Write release notes', to: 'e?In progress' },
    });
  });

  it('builds the whole flow in one turn', () => {
    const plan = planFor('build a workflow');

    expect(plan[0]).toEqual({ name: 'console_goToTab', arguments: { tab: 'workflows' } });
    expect(plan.slice(1).map((call) => call.arguments.label)).toEqual([
      'Trigger',
      'Fetch data',
      'Transform',
      'Send notification',
    ]);
    expect(new Set(plan.slice(1).map((call) => call.name))).toEqual(new Set(['workflow_addStep']));
  });

  it('plans nothing it cannot do, instead of guessing', () => {
    expect(planFor('order me a pizza')).toEqual([]);
  });
});
