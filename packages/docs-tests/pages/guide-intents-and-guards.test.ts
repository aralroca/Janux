import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { boot } from 'janux/client';
import { component, int, intent, jsx, schema } from 'janux';
import { docExample } from '../doc-example';
import { serveIntoDom } from './__fixtures__/serve';

/**
 * guide/intents-and-guards.md — the audit half of the page: every invocation
 * produces an `AuditEntry`, mirrored to `boot({ onAudit })` and the
 * `janux:audit` DOM event, and a `confirm` call audits as proposed first,
 * executed only on approval.
 */

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());
afterEach(() => {
  document.body.innerHTML = '';
  delete (window as any).janux;
});

const desk = component({
  name: 'desk',
  state: schema({ n: int().default(0) }),
  intents: {
    bump: intent({ run: ({ state }: any) => (state.n += 1) }),
    wipe: intent({ guard: 'confirm', run: ({ state }: any) => (state.n = 0) }),
  },
  view: ({ state }: any) => jsx('output', { children: String(state.n) }),
});

describe('guide/intents-and-guards.md — errors and audit', () => {
  it('the documented audit subscription runs as written', async () => {
    await docExample('apps/docs/content/guide/intents-and-guards.md', 3);
  });

  it('onAudit and janux:audit see the same entries, tagged with the origin', async () => {
    await serveIntoDom(jsx(desk as any, {}));
    const entries: any[] = [];
    const events: any[] = [];
    const onEvent = (event: any) => events.push(event.detail);

    document.addEventListener('janux:audit', onEvent);
    const client = boot({ defs: [desk], webmcp: false, onAudit: (entry: any) => entries.push(entry) });

    await client.call('desk.bump');
    document.removeEventListener('janux:audit', onEvent);
    expect(entries.map((entry) => `${entry.tool}:${entry.origin}:${entry.ok}`)).toEqual(['desk.bump:agent:true']);
    expect(events).toEqual(entries);
  });

  it('a confirm call audits as proposed, then as executed on approval', async () => {
    await serveIntoDom(jsx(desk as any, {}));
    const entries: any[] = [];
    const client = boot({ defs: [desk], webmcp: false, onAudit: (entry: any) => entries.push(entry) });
    const proposal: any = await client.call('desk.wipe');

    await client.approve(proposal.id);
    expect(entries.map((entry) => `${entry.tool}:${entry.proposed ?? false}`)).toEqual([
      'desk.wipe:true',
      'desk.wipe:false',
    ]);
  });
});
