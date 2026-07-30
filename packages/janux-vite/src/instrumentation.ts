import { reportError, reportWarning } from 'janux/observability';

/**
 * `src/instrumentation.ts` — the one file an app writes to be observable.
 *
 * The framework imports it and awaits its `register()` BEFORE the server takes
 * a request, which is the only moment an OTel SDK can install its hooks and
 * still see the first render. Everything else in this feature is downstream of
 * that ordering guarantee.
 *
 * ```ts
 * // src/instrumentation.ts
 * import { setTracer, otelTracer } from 'janux/observability';
 * import { trace } from '@opentelemetry/api';
 *
 * export async function register() {
 *   await startYourSdk();
 *   setTracer(otelTracer(trace.getTracer('janux')));
 * }
 * ```
 */
export interface InstrumentationModule {
  register?: () => void | Promise<void>;
}

type Loader = (file: string) => Promise<Record<string, unknown>>;

function registerOf(module: Record<string, unknown>): InstrumentationModule['register'] | undefined {
  const candidate = module.register ?? (module.default as InstrumentationModule | undefined)?.register;

  return typeof candidate === 'function' ? (candidate as InstrumentationModule['register']) : undefined;
}

/**
 * Fail-open without exception: an app whose exporter cannot start still serves.
 * Observability is how you find out the app is broken — it must never be the
 * reason it is. Returns whether anything was registered.
 */
export async function registerInstrumentation(file: string | undefined, load: Loader): Promise<boolean> {
  if (!file) return false;
  try {
    const register = registerOf(await load(file));

    if (!register) {
      reportWarning(`${file} exports no register() — nothing was instrumented`, { phase: 'instrumentation' });

      return false;
    }
    await register();

    return true;
  } catch (error) {
    reportError(error, { phase: 'instrumentation' });

    return false;
  }
}
