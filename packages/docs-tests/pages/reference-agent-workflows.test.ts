import { describe, expect, it } from 'bun:test';
import { connectMcp, createMcpPool, createMemoryStorage, createStep, createWorkflow, createWorkflowRunner } from '@janux/agent';

/**
 * reference/agent-workflows.md and reference/agent-mcp-client.md. The workflow
 * page's whole point is that a run lives only in storage between calls, so the
 * test suspends, drops the runner, and resumes with a fresh one. The MCP page's
 * is namespacing and the injected fetch.
 */

const interview = createWorkflow<{ region?: string; country?: string }>({
  id: 'interview',
  initialState: (input: any) => ({ region: input?.region }),
  steps: [
    createStep({
      id: 'ask-country',
      run: async ({ state, resumeData, suspend }: any) => {
        if (!resumeData) return suspend({ question: 'Which country?' });
        state.country = resumeData;
      },
    }),
    createStep({
      id: 'record',
      run: async ({ state, requestContext }: any) => {
        state.recordedBy = requestContext.userId;
      },
    }),
  ],
});

describe('reference/agent-workflows.md', () => {
  it('suspends with a payload and resumes on a different runner, from storage alone', async () => {
    const storage = createMemoryStorage();
    const started = await createWorkflowRunner(storage).start(interview, { region: 'EU' }, { userId: 'ada' });

    expect(started).toMatchObject({ status: 'suspended', suspendPayload: { question: 'Which country?' } });
    expect(started.state.region).toBe('EU');
    expect(started.runId).toContain('interview');

    // A fresh runner — as a different instance or a deploy later would be.
    const finished = await createWorkflowRunner(storage).resume(interview, started.runId, 'Germany', { userId: 'ada' });

    expect(finished.status).toBe('done');
    expect(finished.state).toMatchObject({ region: 'EU', country: 'Germany', recordedBy: 'ada' });
  });

  it('refuses an unknown run and a mismatched workflow', async () => {
    const storage = createMemoryStorage();
    const runner = createWorkflowRunner(storage);
    const started = await runner.start(interview, {}, {});
    const other = createWorkflow({ id: 'other', initialState: () => ({}), steps: [createStep({ id: 'noop', run: async () => {} })] });

    await expect(runner.resume(interview, 'run_nope', 'x', {})).rejects.toThrow('unknown_run');
    await expect(runner.resume(other as any, started.runId, 'x', {})).rejects.toThrow('workflow_mismatch');
  });
});

describe('reference/agent-mcp-client.md', () => {
  const remote = (tools: unknown[]) => {
    const calls: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => {
      const body = JSON.parse(init.body);

      calls.push({ method: body.method, params: body.params, auth: init.headers?.authorization });
      const result =
        body.method === 'tools/list' ? { tools } : body.method === 'tools/call' ? { content: [{ text: 'ok' }] } : {};

      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    return { fetchImpl, calls };
  };

  it('namespaces remote tool names and un-namespaces them on the way out', async () => {
    const { fetchImpl, calls } = remote([{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }]);
    const connection = connectMcp({ url: 'https://remote/mcp', namespace: 'docs', fetchImpl });
    const [tool] = await connection.tools();

    expect(tool!.name).toBe('docs.search'); // no collision with your own `search`
    await tool!.call({ q: 'janux' });

    expect(calls.at(-1)).toMatchObject({ method: 'tools/call', params: { name: 'search' } }); // bare name on the wire
  });

  it('speaks modern MCP with no handshake and forwards the caller token as a bearer', async () => {
    const { fetchImpl, calls } = remote([]);
    const connection = connectMcp({ url: 'https://remote/mcp', token: 'user-token', fetchImpl });

    await connection.tools();
    await connection.tools();

    expect(calls.filter((call) => call.method === 'initialize')).toHaveLength(0);
    expect(calls[0]!.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
    expect(calls[0]!.auth).toBe('Bearer user-token');
  });

  it('the pool reuses one connection per key', async () => {
    const { fetchImpl } = remote([]);
    const pool = createMcpPool();
    const options = { url: 'https://remote/mcp', fetchImpl };

    expect(pool.get('user-1', options)).toBe(pool.get('user-1', options));
    expect(pool.get('user-2', options)).not.toBe(pool.get('user-1', options));
  });
});
