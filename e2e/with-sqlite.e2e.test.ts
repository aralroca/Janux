import { beforeAll, describe, expect, it } from 'bun:test';
import { ssrApp } from './support/app';

/**
 * The with-sqlite demo's reason to exist: one `bun:sqlite` database behind the
 * two server surfaces at once. `api()` gives validated RPC endpoints that are
 * also agent tools (delete guarded by `confirm` — agents propose, humans
 * approve); the `src/api/**` handlers give the same rows as classic REST,
 * where an HTTP DELETE is itself the human action. Under bun test the module
 * opens `:memory:`, so every run starts from the seeded rows.
 */

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];

const request = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  server.fetch(
    new Request(`http://test${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const rpc = (tool: string, input: unknown, headers: Record<string, string> = {}) =>
  request('POST', `/_janux/api/${tool}`, input, headers);

beforeAll(async () => {
  ({ server, get } = await ssrApp('examples/with-sqlite'));
});

describe('examples/with-sqlite end to end', () => {
  it('SSRs the home with the notes read from SQLite — no pending fallback', async () => {
    const html = await (await get('/')).text();

    expect(html).toContain('<title>Janux + SQLite — notes</title>');
    expect(html).toContain('Hello, SQLite');
    expect(html).toContain('Two server surfaces');
    expect(html).not.toContain('Loading notes');
  });

  it('serves the full CRUD as classic REST handlers over the same database', async () => {
    const created = await request('POST', '/api/notes', { title: 'REST note', body: 'born over HTTP' });

    expect(created.status).toBe(201);
    const note: any = await created.json();

    expect(note.id).toBeGreaterThan(0);
    const listed: any = await (await get('/api/notes')).json();

    expect(listed.notes.map((entry: any) => entry.title)).toContain('REST note');
    const updated: any = await (await request('PUT', `/api/notes/${note.id}`, { title: 'REST note v2' })).json();

    // PUT is partial: the body survives an update that only sends the title.
    expect(updated.title).toBe('REST note v2');
    expect(updated.body).toBe('born over HTTP');
    // A REST DELETE is the human action itself: it executes immediately.
    expect((await request('DELETE', `/api/notes/${note.id}`)).status).toBe(204);
    expect((await get(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await request('POST', '/api/notes', { title: '   ' })).status).toBe(400);
  });

  it('runs the same CRUD through the api() RPC surface, visible from REST', async () => {
    const created: any = (await (await rpc('notes.create', { title: 'RPC note', body: 'born over RPC' })).json()) as any;
    const restView: any = await (await get('/api/notes')).json();

    // One database: a note created via api() shows up on the REST surface.
    expect(restView.notes.map((entry: any) => entry.title)).toContain('RPC note');
    const updated: any = await (await rpc('notes.update', { id: created.result.id, title: 'RPC note v2', body: 'edited' })).json();

    expect(updated.result.title).toBe('RPC note v2');
    const listed: any = await (await rpc('notes.list', {})).json();

    expect(listed.result.notes.map((entry: any) => entry.title)).toContain('RPC note v2');
    // Human-origin remove executes directly: the click is the confirmation.
    const removed: any = await (await rpc('notes.remove', { id: created.result.id })).json();

    expect(removed.result.deleted).toBe(created.result.id);
    expect((await get(`/api/notes/${created.result.id}`)).status).toBe(404);
  });

  it('publishes every surface as tools, with both deletes guarded by confirm', async () => {
    const manifest: any = await (await get('/_janux/manifest?path=/')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards).toEqual({
      'notes.add': 'auto',
      'notes.remove': 'confirm',
      'api.notes.list': 'auto',
      'api.notes.create': 'auto',
      'api.notes.update': 'auto',
      'api.notes.remove': 'confirm',
    });
  });

  it('agent-origin delete yields a Proposal — approve executes it exactly once', async () => {
    const doomed: any = await (await rpc('notes.create', { title: 'Doomed note', body: '' })).json();
    const id = doomed.result.id;
    const proposed: any = await (await rpc('notes.remove', { id }, { 'x-janux-origin': 'agent' })).json();

    expect(proposed.result.status).toBe('proposal');
    expect(proposed.result.tool).toBe('notes.remove');
    // Nothing happened to the database yet: the note is still served.
    expect((await get(`/api/notes/${id}`)).status).toBe(200);
    const approved: any = await (await request('POST', '/_janux/approve', { id: proposed.result.id })).json();

    expect(approved.result.deleted).toBe(id);
    expect((await get(`/api/notes/${id}`)).status).toBe(404);
    // The proposal is consumed: a replayed approval finds nothing to run.
    expect((await request('POST', '/_janux/approve', { id: proposed.result.id })).status).toBe(404);
  });
});
