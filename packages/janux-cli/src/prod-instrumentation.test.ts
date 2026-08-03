import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { isTracing, setTracer } from 'janux/observability';
import { moduleSpecifier, prodServerOptions } from './prod';

const FIXTURE = join(import.meta.dirname, '__fixtures__/instrumented-app');

afterEach(() => setTracer(undefined));

/**
 * The ordering guarantee the whole feature rests on: production wiring loads
 * `src/instrumentation.ts` and awaits `register()` BEFORE a server exists. An
 * SDK that installs itself after the first render has already missed it.
 */
describe('production wiring runs src/instrumentation.ts first', () => {
  it('awaits register(), so the tracer is live before serving', async () => {
    expect(isTracing()).toBe(false);
    await prodServerOptions(FIXTURE);

    expect(isTracing()).toBe(true);
    const { registered } = await import(`${FIXTURE}/src/instrumentation`);

    expect(registered).toContain('register');
  });

  it('is inert for an app that has no instrumentation file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-prod-otel-'));

    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await prodServerOptions(root);

    expect(isTracing()).toBe(false);
  });
});

/**
 * A filesystem path is not a module specifier, and on Windows the app config
 * carries nothing else. `C:\app\src\instrumentation.ts` parses as a URL whose
 * scheme is `c:`, so Node's loader refuses it outright — and `register()` is
 * awaited fail-open, which turns that into an app that simply has no tracer.
 * Bun is worse than an error: it resolves the path to a *second* copy of the
 * module, so the SDK installs itself into an instance nothing else imports.
 */
describe('the specifier an app module is loaded by', () => {
  it('is a file URL, even for a path a URL parser reads as a scheme', () => {
    expect(new URL(moduleSpecifier('C:\\app\\src\\instrumentation.ts')).protocol).toBe('file:');
    expect(new URL(moduleSpecifier('/app/src/instrumentation.ts')).protocol).toBe('file:');
  });
});
