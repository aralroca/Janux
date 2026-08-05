import { describe, expect, it } from 'bun:test';
import { int, jsx, schema, str } from 'janux';
import { api } from './api';
import { createJanuxServer } from './server';

/**
 * The A2A endpoint (`/_janux/a2a`) and the card that advertises it, driven the
 * way an outside agent drives them: over `fetch`, through the real server.
 */

const apis = {
  demo: {
    greet: api({ description: 'Greet a person', input: schema({ name: str() }), run: ({ input }) => `hola ${input.name}` }),
    wipe: api({ description: 'Dangerous wipe', guard: 'confirm', input: schema({ what: str() }), run: () => 'wiped' }),
    nuke: api({ description: 'Never for agents', guard: 'forbidden', run: () => 'boom' }),
    boom: api({
      description: 'Throws',
      run: () => {
        throw new Error('kaboom');
      },
    }),
  },
};

const SKILLS = [
  {
    name: 'refund',
    description: 'How a refund is issued.',
    when: 'A customer asks for their money back.',
    tools: ['demo.greet'],
    body: '# Refund\n\nGreet, then refund.',
    file: '/app/src/skills/refund.md',
  },
];

function server(extra: Record<string, unknown> = {}) {
  return createJanuxServer({
    title: 'demo',
    apis,
    skills: SKILLS,
    routes: { '/': () => jsx('main', { children: jsx('h1', { children: 'Home' }) }) },
    ...extra,
  });
}

type Server = ReturnType<typeof server>;

async function rpc(target: Server, method: string, params?: unknown, headers: Record<string, string> = {}) {
  const res = await target.fetch(
    new Request('http://x/_janux/a2a', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );

  return { status: res.status, body: res.status === 401 ? undefined : await res.json(), headers: res.headers };
}

const invoke = (target: Server, skill: string, input?: unknown, headers?: Record<string, string>) =>
  rpc(target, 'SendMessage', { message: { role: 'ROLE_USER', messageId: 'm1', parts: [{ data: { skill, input } }] } }, headers);

const taskOf = async (target: Server, skill: string, input?: unknown) => (await invoke(target, skill, input)).body.result.task;

const cardOf = async (target: Server, path = '/.well-known/agent-card.json') => {
  const res = await target.fetch(new Request(`http://x${path}`));

  return { status: res.status, type: res.headers.get('content-type'), card: await res.json() };
};

describe('agent card (/.well-known/agent-card.json)', () => {
  it('is served as JSON and names the app', async () => {
    const { status, type, card } = await cardOf(server());

    // The charset suffix is the runtime's business, not the card's — asserting
    // it verbatim pins a Bun detail rather than a claim about this endpoint.
    expect([status, type?.startsWith('application/json')]).toEqual([200, true]);
    expect(card.name).toBe('demo');
  });

  it('advertises the A2A endpoint as an absolute URL on the requested origin', async () => {
    const { card } = await cardOf(server());

    expect(card.supportedInterfaces[0].url).toBe('http://x/_janux/a2a');
  });

  it('prefers the configured siteUrl, so a proxied deployment advertises its public origin', async () => {
    const { card } = await cardOf(server({ siteUrl: 'https://shop.example' }));

    expect(card.supportedInterfaces[0].url).toBe('https://shop.example/_janux/a2a');
  });

  it('is also served without the .json suffix', async () => {
    expect((await cardOf(server(), '/.well-known/agent-card')).card.name).toBe('demo');
  });

  it('lists exactly the tools the caller may call, never the forbidden one', async () => {
    const { card } = await cardOf(server());

    expect(card.skills.map((skill: { id: string }) => skill.id)).toEqual([
      'demo.greet',
      'demo.wipe',
      'demo.boom',
      'skill:refund',
    ]);
  });

  it('never leaks a forbidden tool through the input schemas either', async () => {
    const { card } = await cardOf(server());

    expect(JSON.stringify(card)).not.toContain('nuke');
  });

  it('takes its description from the one the app already wrote for llms.txt', async () => {
    const { card } = await cardOf(server({ llmsTxt: { description: 'A demo app.' } }));

    expect(card.description).toBe('A demo app.');
  });

  it('is public even when the endpoint requires a bearer, and declares the scheme', async () => {
    const { status, card } = await cardOf(server({ mcpAuth: { verify: (token: string) => (token === 'ok' ? { sub: 'u' } : null) } }));

    expect(status).toBe(200);
    expect(card.securitySchemes.bearer.httpAuthSecurityScheme.scheme).toBe('Bearer');
  });
});

describe('A2A endpoint (/_janux/a2a)', () => {
  it('answers a GET with the card, so the URL explains itself', async () => {
    const res = await server().fetch(new Request('http://x/_janux/a2a'));

    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('demo');
  });

  it('runs an auto tool and returns a completed task carrying the result', async () => {
    const task = await taskOf(server(), 'demo.greet', { name: 'ana' });

    expect(task.status.state).toBe('TASK_STATE_COMPLETED');
    expect(task.artifacts[0].parts[0].data).toBe('hola ana');
    expect(task.artifacts[0].name).toBe('demo.greet');
  });

  it('echoes the JSON-RPC id and stamps the status', async () => {
    const { body } = await invoke(server(), 'demo.greet', { name: 'ana' });

    expect(body.id).toBe(1);
    expect(body.result.task.status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps the caller-provided contextId, so a conversation stays one thread', async () => {
    const { body } = await rpc(server(), 'SendMessage', {
      message: { role: 'ROLE_USER', messageId: 'm1', contextId: 'ctx-7', parts: [{ data: { skill: 'demo.greet', input: { name: 'ana' } } }] },
    });

    expect(body.result.task.contextId).toBe('ctx-7');
  });

  it('parks a confirm-guarded tool as input-required instead of running it', async () => {
    const task = await taskOf(server(), 'demo.wipe', { what: 'disk' });

    expect(task.status.state).toBe('TASK_STATE_INPUT_REQUIRED');
    expect(task.artifacts).toBeUndefined();
  });

  it('hands the proposal a human settles back to the caller', async () => {
    const task = await taskOf(server(), 'demo.wipe', { what: 'disk' });
    const [, data] = task.status.message.parts;

    expect(data.data.tool).toBe('demo.wipe');
    expect(data.data.input).toEqual({ what: 'disk' });
    expect(data.data.proposal).toMatch(/^prop_api_[0-9a-f-]{36}\./);
    expect(data.data.approve).toBe('/_janux/approve');
  });

  /**
   * The bare proposal id travels in spans and audit entries because on its own
   * it grants nothing. If the task were named after it, an id read off a log
   * would buy a read of whatever the approved call returned.
   */
  it('gives the task an id of its own, unrelated to the proposal it mirrors', async () => {
    const task = await taskOf(server(), 'demo.wipe', { what: 'disk' });
    const proposal: string = task.status.message.parts[1].data.proposal;

    expect(proposal.startsWith(task.id)).toBe(false);
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a forbidden tool with a failed task rather than pretending it does not exist', async () => {
    const task = await taskOf(server(), 'demo.nuke');

    expect(task.status.state).toBe('TASK_STATE_FAILED');
    expect(task.status.message.parts[0].text).toBe('Error: Tool "demo.nuke" is not available');
  });

  it('validates input before anything runs', async () => {
    const task = await taskOf(server(), 'demo.greet', { name: 7 });

    expect(task.status.message.parts[0].text).toBe('Error: Invalid input for "demo.greet" — name: expected string');
  });

  it('reports a throwing tool as a failed task', async () => {
    expect((await taskOf(server(), 'demo.boom')).status.message.parts[0].text).toBe('Error: kaboom');
  });

  it('names the skill it could not find', async () => {
    expect((await taskOf(server(), 'demo.ghost')).status.message.parts[0].text).toBe('Error: Unknown api tool "demo.ghost"');
  });

  it('answers a procedure skill with its markdown body', async () => {
    const task = await taskOf(server(), 'skill:refund');

    expect(task.status.state).toBe('TASK_STATE_COMPLETED');
    expect(task.artifacts[0].parts[0].text).toBe('# Refund\n\nGreet, then refund.');
  });

  it('says so when the procedure does not exist', async () => {
    expect((await taskOf(server(), 'skill:ghost')).status.message.parts[0].text).toBe('Error: Unknown skill "skill:ghost"');
  });

  it('refuses a message with nothing structured to invoke', async () => {
    const { body } = await rpc(server(), 'SendMessage', {
      message: { role: 'ROLE_USER', messageId: 'm1', parts: [{ text: 'please ship my order' }] },
    });

    expect(body.error.code).toBe(-32005);
    expect(body.error.message).toContain('DataPart');
  });

  it('refuses a data part that names no skill', async () => {
    const { body } = await rpc(server(), 'SendMessage', {
      message: { role: 'ROLE_USER', messageId: 'm1', parts: [{ data: { hello: 'world' } }] },
    });

    expect(body.error.code).toBe(-32602);
  });
});

describe('A2A task lifecycle', () => {
  const approve = (target: Server, proposal: string) =>
    target.fetch(
      new Request('http://x/_janux/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://x', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ id: proposal }),
      }),
    );

  const parked = async (target: Server) => {
    const task = await taskOf(target, 'demo.wipe', { what: 'disk' });

    return { id: task.id as string, proposal: task.status.message.parts[1].data.proposal as string };
  };

  const getTask = async (target: Server, id: string) => (await rpc(target, 'GetTask', { id })).body;

  it('reports a parked task as still waiting for its human', async () => {
    const target = server();
    const { id } = await parked(target);

    expect((await getTask(target, id)).result.status.state).toBe('TASK_STATE_INPUT_REQUIRED');
  });

  it('completes the task with the result once a human approves', async () => {
    const target = server();
    const { id, proposal } = await parked(target);

    await approve(target, proposal);
    const { result } = await getTask(target, id);

    expect(result.status.state).toBe('TASK_STATE_COMPLETED');
    expect(result.artifacts[0].parts[0].data).toBe('wiped');
  });

  it('cancels the task when the human rejects it', async () => {
    const target = server();
    const { id, proposal } = await parked(target);

    await target.fetch(
      new Request('http://x/_janux/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://x', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ id: proposal }),
      }),
    );

    expect((await getTask(target, id)).result.status.state).toBe('TASK_STATE_CANCELED');
  });

  it('a task nobody parked is not found', async () => {
    const { error } = await getTask(server(), 'nope');

    expect([error.code, error.message]).toEqual([-32001, 'Task not found: nope']);
  });

  it('a completed one-shot call leaves no task to poll — the answer was the reply', async () => {
    const target = server();
    const task = await taskOf(target, 'demo.greet', { name: 'ana' });

    expect((await getTask(target, task.id)).error.code).toBe(-32001);
  });
});

describe('A2A protocol surface', () => {
  it('rejects an operation it does not implement as unsupported, not as unknown', async () => {
    const { body } = await rpc(server(), 'SubscribeToTask', { id: 'x' });

    expect(body.error.code).toBe(-32004);
  });

  it('rejects a method that is not A2A at all as method-not-found', async () => {
    expect((await rpc(server(), 'tools/list')).body.error.code).toBe(-32601);
  });

  it('refuses unparseable JSON', async () => {
    const res = await server().fetch(
      new Request('http://x/_janux/a2a', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('serves no other verb', async () => {
    const res = await server().fetch(new Request('http://x/_janux/a2a', { method: 'DELETE' }));

    expect([res.status, res.headers.get('allow')]).toEqual([405, 'POST']);
  });
});

describe('A2A bearer auth', () => {
  const guarded = () => server({ mcpAuth: { verify: (token: string) => (token === 'good' ? { sub: 'u1' } : null) } });

  it('refuses a call with no token, exactly as the MCP endpoint does', async () => {
    const { status, headers } = await invoke(guarded(), 'demo.greet', { name: 'ana' });

    expect(status).toBe(401);
    expect(headers.get('www-authenticate')).toBe('Bearer realm="janux-a2a"');
  });

  it('refuses a wrong token', async () => {
    expect((await invoke(guarded(), 'demo.greet', { name: 'ana' }, { authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('serves a good token', async () => {
    const { body } = await invoke(guarded(), 'demo.greet', { name: 'ana' }, { authorization: 'Bearer good' });

    expect(body.result.task.artifacts[0].parts[0].data).toBe('hola ana');
  });

  it('checks the token before parsing the body', async () => {
    const res = await guarded().fetch(
      new Request('http://x/_janux/a2a', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' }),
    );

    expect(res.status).toBe(401);
  });
});

describe('A2A and MCP cannot diverge', () => {
  it('a ctx-scoped guard hides the tool from both listings and both refuse it', async () => {
    const scoped = createJanuxServer({
      title: 'demo',
      apis: { demo: { secret: api({ description: 'Admins only', guard: ({ ctx }) => (ctx.role === 'admin' ? 'auto' : 'forbidden'), run: () => 'ok' }) } },
      routes: { '/': () => jsx('main', { children: 'x' }) },
    });
    const { card } = await cardOf(scoped);
    const mcp = await scoped.fetch(
      new Request('http://x/_janux/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );

    expect(card.skills).toEqual([]);
    expect((await mcp.json()).result.tools).toEqual([]);
    expect((await taskOf(scoped, 'demo.secret')).status.message.parts[0].text).toBe('Error: Tool "demo.secret" is not available');
  });
});
