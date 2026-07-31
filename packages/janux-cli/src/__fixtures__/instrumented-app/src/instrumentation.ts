import { setTracer } from 'janux/observability';

/**
 * The `instrumentation.ts` convention, as a fixture: production wiring must
 * import this file and await `register()` before the server exists.
 */
export const registered: string[] = [];

export async function register() {
  await Promise.resolve();
  registered.push('register');
  setTracer({ span: (_name, _attributes, run) => run({ setAttributes: () => undefined, recordError: () => undefined }) });
}
