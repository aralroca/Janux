import { describe, expect, it } from 'bun:test';
import { jsx, renderToString } from 'janux';
import { buildManifest } from 'janux/manifest';
import { collectApis, invokeApi } from '@janux/server';
import { docExample } from '../doc-example';
import { TaskBoard, attachedBoard as board } from './__fixtures__/task-board';

/**
 * The three tutorial parts build one app, so one file runs it. The board is
 * assembled exactly as tutorial/tasks-app-part-1.md documents it (its fences are
 * deliberately split into state / intents / view), then driven through the
 * flows parts 1–3 promise — including part 3's test snippet, step by step.
 */

describe('tutorial/tasks-app-part-1.md', () => {
  it('projects the documented description and tool names into the manifest', async () => {
    const instance = await board();
    const manifest: any = buildManifest([{ def: TaskBoard, key: 'default', instance }] as any, {});

    expect(manifest.tools.map((tool: any) => tool.name).sort()).toEqual(['tasks.add', 'tasks.clearDone', 'tasks.toggle']);
    expect(manifest.resources[0].description).toContain('Agents can add, toggle, filter');
  });

  it('validates the title before run, and derives what is left', async () => {
    const instance = await board();

    await expect(instance.intents.add({ title: '' })).rejects.toThrow();
    await instance.intents.add({ title: 'milk' });

    expect(instance.bag.derived.remaining).toBe(1);
    await instance.intents.toggle({ id: instance.snapshot().tasks[0].id });

    expect(instance.bag.derived.remaining).toBe(0);
  });

  it('marks the form and the button so one delegated listener can resume the island', async () => {
    const instance = await board();

    await instance.intents.add({ title: 'bread' });
    const { html } = await renderToString(jsx(TaskBoard, { initial: instance.snapshot() }), {});

    expect(html).toContain('data-jxform="tasks#default:add"');
    expect(html).toContain('data-jxa="tasks#default:toggle"');
    expect(html).toContain('data-input="{&quot;id&quot;:');
  });
});

describe('tutorial/tasks-app-part-2.md', () => {
  it('the api() module becomes namespaced tools that round-trip through ctx', async () => {
    const module = await docExample('apps/docs/content/tutorial/tasks-app-part-2.md', 0);
    const tools = collectApis({ tasks: module });
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual(['tasks.loadTasks', 'tasks.saveTasks']);
    const save = tools.find((tool) => tool.name === 'tasks.saveTasks')!;
    const load = tools.find((tool) => tool.name === 'tasks.loadTasks')!;
    const ctx = { userId: 'u1' };

    expect(await invokeApi(save, { tasks: [{ id: 't1', title: 'milk', done: false }] }, ctx, 'human')).toEqual({ saved: 1 });
    expect(await invokeApi(load, {}, ctx, 'human')).toEqual({ tasks: [{ id: 't1', title: 'milk', done: false }] });
    expect(await invokeApi(load, {}, { userId: 'someone-else' }, 'human')).toEqual({ tasks: [] });
  });

  it('rejects a task list that does not match the schema', async () => {
    const module = await docExample('apps/docs/content/tutorial/tasks-app-part-2.md', 0);
    const save = collectApis({ tasks: module }).find((tool) => tool.name === 'tasks.saveTasks')!;

    await expect(invokeApi(save, { tasks: [{ id: 't1' }] }, {}, 'human')).rejects.toThrow();
  });

  it('the initial prop seeds the island state, and SSR ships it in the snapshot', async () => {
    const seeded = { tasks: [{ id: 't9', title: 'seeded', done: false }], filter: 'all' };
    const { html, snapshots } = await renderToString(jsx(TaskBoard, { initial: seeded }), {});

    expect(html).toContain('1 left');
    expect(snapshots[0]!.state).toMatchObject(seeded);
  });
});

describe('tutorial/tasks-app-part-3.md', () => {
  it('runs the documented test: clearDone is a proposal for agents, applied only on approval', async () => {
    let proposal: any;
    const instance = await board({ onProposal: (received: any) => (proposal = received) });

    await instance.intents.add({ title: 'done thing' });
    await instance.intents.toggle({ id: instance.snapshot().tasks[0].id });
    const result: any = await instance.intents.clearDone({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    expect(instance.snapshot().tasks).toHaveLength(1);

    await proposal.execute();

    expect(instance.snapshot().tasks).toHaveLength(0);
  });

  it('a human clearing done tasks needs no approval at all', async () => {
    const instance = await board();

    await instance.intents.add({ title: 'done thing' });
    await instance.intents.toggle({ id: instance.snapshot().tasks[0].id });
    await instance.intents.clearDone();

    expect(instance.snapshot().tasks).toHaveLength(0);
  });
});
