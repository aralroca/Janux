import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { isTracing, setTracer } from 'janux/observability';
import { prodServerOptions } from './prod';

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
