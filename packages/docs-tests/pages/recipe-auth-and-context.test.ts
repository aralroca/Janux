import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, createJanuxServer } from '@janux/server';
import { resolveAppConfig } from '@janux/vite';
import { component, createInstance, intent, jsx, schema, str } from 'janux';
import { buildManifest } from 'janux/manifest';

/**
 * recipes/auth-and-context.md claims ctx is built once per request and reaches
 * everything, that guards resolve per ctx, and that a forbidden tool disappears
 * from the manifest for that context. All three run here — plus the convention
 * itself: src/ctx.ts is what wires ctxFor (the page used to claim src/server).
 */

const Orders = component({
  name: 'orders',
  description: 'Order list',
  state: schema({ status: str().default('idle') }),
  intents: {
    refund: intent({
      description: 'Refund an order',
      guard: ({ ctx }: any) => (ctx.role === 'admin' ? 'auto' : 'confirm'),
      run: ({ state }: any) => (state.status = 'refunded'),
    }),
    wipe: intent({
      description: 'Delete every order',
      guard: ({ ctx }: any) => (ctx.role === 'admin' ? 'confirm' : 'forbidden'),
      run: ({ state }: any) => (state.status = 'wiped'),
    }),
  },
  view: ({ state }: any) => jsx('p', { children: state.status }),
});

async function instanceFor(ctx: Record<string, unknown>) {
  const instance = createInstance(Orders, { ctx, onProposal: () => {} } as any);

  await instance.attach();

  return instance;
}

describe('recipes/auth-and-context.md — the src/ctx.ts convention', () => {
  it('is what resolves ctxFor for dev and start', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-ctx-'));

    writeFileSync(join(root, 'package.json'), '{"name":"x"}');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/ctx.ts'), 'export default () => ({ role: "guest" });');

    expect((await resolveAppConfig(root)).ctxModule).toBe(join(root, 'src/ctx.ts'));
  });

  it('reaches routes and api() alike, once per request', async () => {
    const server = createJanuxServer({
      ctxFor: (req) => ({ role: req.headers.get('x-role') ?? 'guest' }),
      routes: { '/': ({ ctx }: any) => jsx('h1', { children: `role:${ctx.role}` }) },
      apis: { me: { role: api({ description: 'My role', run: ({ ctx }: any) => ctx.role }) } },
    });
    const html = await (await server.fetch(new Request('http://test/', { headers: { 'x-role': 'admin' } }))).text();
    const rpc: any = await (
      await server.fetch(
        new Request('http://test/_janux/api/me.role', {
          method: 'POST',
          body: '{}',
          headers: { 'content-type': 'application/json', 'x-role': 'admin' },
        }),
      )
    ).json();

    expect(html).toContain('<h1>role:admin</h1>');
    expect(rpc.result).toBe('admin');
    expect(await (await server.fetch(new Request('http://test/'))).text()).toContain('role:guest');
  });
});

describe('recipes/auth-and-context.md — guards resolve per ctx', () => {
  it("an admin's agent refunds unattended; everyone else's proposes", async () => {
    const admin = await instanceFor({ role: 'admin' });
    const guest = await instanceFor({ role: 'guest' });

    await admin.intents.refund(undefined, { origin: 'agent' });

    expect(admin.snapshot().status).toBe('refunded');
    const proposed: any = await guest.intents.refund(undefined, { origin: 'agent' });

    expect(proposed.status).toBe('proposal');
    expect(guest.snapshot().status).toBe('idle');
  });

  it('a forbidden tool disappears from the manifest for that ctx', async () => {
    const admin = await instanceFor({ role: 'admin' });
    const guest = await instanceFor({ role: 'guest' });
    const names = (ctx: Record<string, unknown>, instance: any) =>
      (buildManifest([{ def: Orders, key: 'default', instance }] as any, ctx as any) as any).tools.map(
        (tool: any) => tool.name,
      );

    expect(names({ role: 'admin' }, admin).sort()).toEqual(['orders.refund', 'orders.wipe']);
    expect(names({ role: 'guest' }, guest)).toEqual(['orders.refund']); // wipe is invisible
  });

  it('an agent cannot call what it cannot see', async () => {
    const guest = await instanceFor({ role: 'guest' });

    await expect(guest.intents.wipe(undefined, { origin: 'agent' })).rejects.toThrow(/not available/);
    await guest.intents.wipe(); // a human still can — guards are about agents

    expect(guest.snapshot().status).toBe('wiped');
  });
});
