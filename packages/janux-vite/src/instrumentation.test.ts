import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { setOnError, setTracer, type ErrorInfo } from 'janux/observability';
import { registerInstrumentation } from './instrumentation';

afterEach(() => {
  setTracer(undefined);
  setOnError(undefined);
});

const loaderFor = (module: unknown) => mock(async () => module as Record<string, unknown>);

describe('the instrumentation.ts convention', () => {
  it('does nothing at all when the app has no instrumentation file', async () => {
    const load = loaderFor({});

    expect(await registerInstrumentation(undefined, load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('runs register() before the server serves anything', async () => {
    const register = mock(() => undefined);

    expect(await registerInstrumentation('/app/src/instrumentation.ts', loaderFor({ register }))).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('awaits an async register — an exporter that connects must finish connecting', async () => {
    const order: string[] = [];
    const register = async () => {
      await Promise.resolve();
      order.push('registered');
    };

    await registerInstrumentation('/app/src/instrumentation.ts', loaderFor({ register }));
    order.push('serving');

    expect(order).toEqual(['registered', 'serving']);
  });

  it('accepts register() on the default export too', async () => {
    const register = mock(() => undefined);

    expect(await registerInstrumentation('/app/src/instrumentation.ts', loaderFor({ default: { register } }))).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('warns, and serves, when the file exports no register()', async () => {
    const warned = spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await registerInstrumentation('/app/src/instrumentation.ts', loaderFor({ setup: () => undefined }))).toBe(false);
    expect(String(warned.mock.calls[0]![1])).toContain('register()');
    warned.mockRestore();
  });

  it('serves the app anyway when instrumentation itself throws', async () => {
    const onError = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);

    setOnError(onError);
    const load = async () => {
      throw new Error('sentry sdk blew up');
    };

    expect(await registerInstrumentation('/app/src/instrumentation.ts', load)).toBe(false);
    expect(onError.mock.calls[0]![1]).toMatchObject({ phase: 'instrumentation', level: 'error' });
  });

  it('serves the app anyway when register() itself throws', async () => {
    const onError = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);

    setOnError(onError);
    const register = () => {
      throw new Error('bad DSN');
    };

    expect(await registerInstrumentation('/app/src/instrumentation.ts', loaderFor({ register }))).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});
