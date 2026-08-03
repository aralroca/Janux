import { afterEach, describe, expect, it } from 'bun:test';
import { schema, str } from 'janux';
import { api, collectApis, invokeApi } from './api';
import { mockApi, resetApiMocks } from './api-mocks';

const greet = api({
  description: 'Greets someone',
  input: schema({ name: str() }),
  output: schema({ message: str() }),
  run: ({ input }) => ({ message: `hello ${input.name}` }),
});

const locked = api({
  guard: 'forbidden',
  run: () => 'secret',
});

afterEach(resetApiMocks);

describe('mockApi by function reference', () => {
  it('replaces run() for direct server-side calls', async () => {
    mockApi(greet, () => ({ message: 'mocked' }));

    expect(await greet({ name: 'Ada' })).toEqual({ message: 'mocked' });
  });

  it('reaches the collected tool the HTTP boundary dispatches, registered before or after collection', async () => {
    const [tool] = collectApis({ demo: { greet } });

    mockApi(greet, () => ({ message: 'mocked late' }));

    expect(await invokeApi(tool!, { name: 'Ada' }, {}, 'human')).toEqual({ message: 'mocked late' });
  });

  it('still validates input against the real schema', async () => {
    mockApi(greet, () => ({ message: 'mocked' }));

    expect(greet({ name: 42 })).rejects.toThrow(/Invalid input/);
  });

  it('still validates the mock output against the real schema', async () => {
    mockApi(greet, () => ({ message: 7 }));

    expect(greet({ name: 'Ada' })).rejects.toThrow(/invalid output/);
  });

  it('still enforces the guard for agent calls', async () => {
    mockApi(locked, () => 'mocked');

    expect(invokeApi({ ...locked, name: 'demo.locked' }, undefined, {}, 'agent')).rejects.toThrow(
      /not available/,
    );
  });

  it('leaves a newer mock alone when an older restore() runs', async () => {
    const stale = mockApi(greet, () => ({ message: 'first' }));

    mockApi(greet, () => ({ message: 'second' }));
    stale();

    expect(await greet({ name: 'Ada' })).toEqual({ message: 'second' });
  });

  it('returns a restore() that removes just that mock', async () => {
    const restore = mockApi(greet, () => ({ message: 'mocked' }));

    restore();

    expect(await greet({ name: 'Ada' })).toEqual({ message: 'hello Ada' });
  });
});

describe('mockApi by wire name', () => {
  it('replaces run() for the named tool at the invocation boundary', async () => {
    const [tool] = collectApis({ demo: { greet } });

    mockApi('demo.greet', () => ({ message: 'named mock' }));

    expect(await invokeApi(tool!, { name: 'Ada' }, {}, 'human')).toEqual({ message: 'named mock' });
  });
});

describe('resetApiMocks', () => {
  it('drops every registered mock at once', async () => {
    mockApi(greet, () => ({ message: 'mocked' }));

    resetApiMocks();

    expect(await greet({ name: 'Ada' })).toEqual({ message: 'hello Ada' });
  });
});
