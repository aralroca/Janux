import { describe, expect, it } from 'bun:test';
import { createInstance } from 'janux';
import { docExample } from '../doc-example';

describe('guide/stores.md — Session store example', () => {
  it('defaults, derived state, intents and guards behave as documented', async () => {
    const { Session } = await docExample('apps/docs/content/guide/stores.md');
    const session = createInstance(Session);

    await session.attach();

    expect(session.uri).toBe('store://session');
    expect(session.snapshot().locale).toBe('en');
    expect(session.bag.derived.isLoggedIn).toBe(false);

    await session.intents.setLocale({ locale: 'es' });

    expect(session.snapshot().locale).toBe('es');

    const result: any = await session.intents.logout(undefined, { origin: 'agent' });

    expect(result?.status).toBe('proposal');
  });
});
