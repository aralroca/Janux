import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { getOnError, reportError, reportWarning, setOnError, type ErrorInfo } from './errors';

afterEach(() => setOnError(undefined));

describe('the global error sink', () => {
  it('is absent until an app registers one', () => {
    expect(getOnError()).toBeUndefined();
  });

  it('hands the failure and its phase to the registered handler', () => {
    const handler = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);
    const boom = new Error('render failed');

    setOnError(handler);
    reportError(boom, { phase: 'ssr', route: '/orders' });

    expect(handler).toHaveBeenCalledWith(boom, { phase: 'ssr', route: '/orders', level: 'error' });
  });

  it('marks warnings so a handler can route them apart from failures', () => {
    const handler = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);

    setOnError(handler);
    reportWarning('proposal store is full', { phase: 'invocation' });

    expect(handler.mock.calls[0]![1]).toEqual({ phase: 'invocation', level: 'warning' });
    expect(String(handler.mock.calls[0]![0])).toContain('proposal store is full');
  });

  it('falls back to the console when no handler is registered', () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);

    reportError(new Error('boom'), { phase: 'ssr', route: '/orders' });

    expect(logged).toHaveBeenCalled();
    expect(String(logged.mock.calls[0]![0])).toContain('/orders');
    logged.mockRestore();
  });

  it('keeps reporting through the console when the handler itself throws', () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const warned = spyOn(console, 'warn').mockImplementation(() => undefined);

    setOnError(() => {
      throw new Error('sentry is down');
    });
    // Fail-open: reporting a failure must never become a second failure.
    expect(() => reportError(new Error('boom'), { phase: 'ssr' })).not.toThrow();
    expect(logged).toHaveBeenCalled();
    expect(warned).toHaveBeenCalled();
    logged.mockRestore();
    warned.mockRestore();
  });

  it('stops calling a handler once the app clears it', () => {
    const handler = mock<(error: unknown, info: ErrorInfo) => void>(() => undefined);
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);

    setOnError(handler);
    setOnError(undefined);
    reportError(new Error('boom'), { phase: 'ssr' });

    expect(handler).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
